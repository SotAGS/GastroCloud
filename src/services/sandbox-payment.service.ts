import { randomUUID } from 'node:crypto';
import https from 'node:https';
import { sequelize } from '../config/database.config';
import { env, isProduction } from '../config/env.config';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';
import { AuthUser } from '../interfaces/auth-user.interface';
import { Company, PaymentAttempt } from '../models';
import { HttpError } from '../utils/http-error.util';
import { getEffectiveSubscriptionPlan } from './account-policy.service';
import { requireCompanyAdministrator } from './company-administrator.service';

const API_BASE = 'https://api.mercadopago.com';
const PREMIUM_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(502, 'Mercado Pago devolvió una respuesta inválida.');
  }
  return value as Record<string, unknown>;
}

function providerId(value: unknown): string {
  if (typeof value === 'string' && /^\d{1,30}$/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  throw new HttpError(502, 'Mercado Pago devolvió un identificador inválido.');
}

function sandboxUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 500) {
    throw new HttpError(502, 'Mercado Pago no devolvió un enlace de prueba válido.');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    throw new HttpError(502, 'Mercado Pago no devolvió un enlace de prueba válido.');
  }
  if (url.protocol !== 'https:' || !['sandbox.mercadopago.com', 'sandbox.mercadopago.com.ar'].includes(url.hostname)
    || url.username || url.password || url.port) {
    throw new HttpError(502, 'Mercado Pago no devolvió un enlace de prueba válido.');
  }
  return url.toString();
}

export const sandboxProvider = {
  async request(path: string, method: 'GET' | 'POST', payload?: object): Promise<unknown> {
    if (isProduction) {
      throw new HttpError(403, 'El pago de prueba solo está disponible en desarrollo.');
    }
    if (!env.mercadoPagoTestAccessToken) {
      throw new HttpError(503, 'Configura el Access Token de prueba de Mercado Pago antes de continuar.');
    }
    let response: { status: number; body: string };
    try {
      response = await new Promise((resolve, reject) => {
        const request = https.request(`${API_BASE}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${env.mercadoPagoTestAccessToken}`,
            ...(payload ? { 'Content-Type': 'application/json' } : {}),
          },
        }, (result) => {
          let body = '';
          result.setEncoding('utf8');
          result.on('data', (chunk: string) => {
            body += chunk;
            if (body.length > 1024 * 1024) result.destroy(new Error('Respuesta demasiado grande'));
          });
          result.on('error', reject);
          result.on('end', () => resolve({ status: result.statusCode ?? 0, body }));
        });
        request.setTimeout(15000, () => request.destroy(new Error('Tiempo de espera agotado')));
        request.on('error', reject);
        if (payload) request.write(JSON.stringify(payload));
        request.end();
      });
    } catch (error) {
      console.error('No se pudo conectar con Mercado Pago:', error instanceof Error ? error.message : error);
      throw new HttpError(502, 'No se pudo conectar con Mercado Pago. Inténtalo nuevamente.');
    }
    if (response.status < 200 || response.status >= 300) {
      console.error('Mercado Pago rechazó la solicitud de prueba:', response.status);
      throw new HttpError(502, 'Mercado Pago rechazó la solicitud de prueba. Revisa la configuración.');
    }
    try {
      return JSON.parse(response.body) as unknown;
    } catch (error) {
      console.error('Mercado Pago devolvió JSON inválido:', error instanceof Error ? error.message : error);
      throw new HttpError(502, 'Mercado Pago devolvió una respuesta inválida.');
    }
  },
};

export class SandboxPaymentService {
  async list(user: AuthUser) {
    const actor = await requireCompanyAdministrator(user);
    const attempts = await PaymentAttempt.findAll({
      where: { companyId: actor.companyId },
      order: [['createdAt', 'DESC']],
      limit: 20,
    });
    return { attempts, company: actor.company };
  }

  async create(user: AuthUser): Promise<string> {
    const actor = await requireCompanyAdministrator(user);
    const company = actor.company;
    if (getEffectiveSubscriptionPlan(company.subscriptionPlan, company.subscriptionStatus, company.premiumExpiresAt) === 'PREMIUM') {
      throw new HttpError(409, 'La empresa ya tiene Premium activo.');
    }

    const id = randomUUID();
    const preference = objectValue(await sandboxProvider.request('/checkout/preferences', 'POST', {
      items: [{ id: 'premium-demo', title: 'Premium de prueba por 30 días', quantity: 1, currency_id: 'ARS', unit_price: 1 }],
      external_reference: id,
    }));
    if (typeof preference.id !== 'string' || !preference.id || preference.id.length > 120) {
      throw new HttpError(502, 'Mercado Pago devolvió una preferencia inválida.');
    }
    const checkoutUrl = sandboxUrl(preference.sandbox_init_point);
    await PaymentAttempt.create({
      id,
      companyId: company.id,
      createdByUserId: actor.id,
      preferenceId: preference.id,
      collectorId: providerId(preference.collector_id),
      checkoutUrl,
      status: 'PENDING',
    });
    return checkoutUrl;
  }

  async confirm(user: AuthUser, attemptId: string): Promise<void> {
    const actor = await requireCompanyAdministrator(user);
    const attempt = await PaymentAttempt.findOne({ where: { id: attemptId, companyId: actor.companyId } });
    if (!attempt) throw new HttpError(404, 'Pago de prueba no encontrado.');
    if (attempt.status === 'APPROVED') return;
    if (attempt.status !== 'PENDING') throw new HttpError(409, 'El pago no está pendiente.');

    const result = objectValue(await sandboxProvider.request(
      `/v1/payments/search?external_reference=${encodeURIComponent(attempt.id)}&sort=date_created&criteria=desc&limit=100`,
      'GET',
    ));
    if (!Array.isArray(result.results)) {
      throw new HttpError(502, 'Mercado Pago devolvió una lista de pagos inválida.');
    }
    const approved = result.results.map(objectValue).find((payment) =>
      payment.status === 'approved' && payment.live_mode === false &&
      payment.external_reference === attempt.id && payment.currency_id === 'ARS' &&
      payment.transaction_amount === 1 && String(payment.collector_id) === attempt.collectorId &&
      (payment.transaction_amount_refunded === undefined || payment.transaction_amount_refunded === 0),
    );
    if (!approved) throw new HttpError(409, 'Todavía no hay un pago de prueba aprobado para esta empresa.');
    const paymentId = providerId(approved.id);
    if (typeof approved.date_approved !== 'string') {
      throw new HttpError(502, 'Mercado Pago no informó la fecha de aprobación.');
    }
    const paidAt = new Date(approved.date_approved);
    const paidTime = paidAt.getTime();
    const now = Date.now();
    if (!Number.isFinite(paidTime) || paidTime > now + 5 * 60 * 1000 || paidTime + PREMIUM_DURATION_MS <= now) {
      throw new HttpError(409, 'La fecha del pago no permite activar Premium.');
    }

    await sequelize.transaction(async (transaction) => {
      const lockedAttempt = await PaymentAttempt.findOne({
        where: { id: attempt.id, companyId: actor.companyId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!lockedAttempt) throw new HttpError(404, 'Pago de prueba no encontrado.');
      if (lockedAttempt.status === 'APPROVED') return;
      if (lockedAttempt.status !== 'PENDING') throw new HttpError(409, 'El pago no está pendiente.');
      const company = await Company.findByPk(actor.company.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!company?.isActive || company.isSupportOperator) {
        throw new HttpError(403, 'La empresa ya no está habilitada.');
      }
      if (getEffectiveSubscriptionPlan(company.subscriptionPlan, company.subscriptionStatus, company.premiumExpiresAt) === 'PREMIUM'
        && !company.premiumExpiresAt) {
        throw new HttpError(409, 'La empresa ya tiene Premium sin vencimiento.');
      }
      const activeExpiration = company.subscriptionStatus === 'ACTIVE' && company.subscriptionPlan === SubscriptionPlan.PREMIUM
        ? company.premiumExpiresAt?.getTime() ?? 0 : 0;
      company.subscriptionPlan = SubscriptionPlan.PREMIUM;
      company.subscriptionStatus = 'ACTIVE';
      company.premiumExpiresAt = new Date(Math.max(paidTime, activeExpiration) + PREMIUM_DURATION_MS);
      lockedAttempt.status = 'APPROVED';
      lockedAttempt.providerPaymentId = paymentId;
      lockedAttempt.paidAt = paidAt;
      await company.save({ transaction });
      await lockedAttempt.save({ transaction });
    });
  }
}
