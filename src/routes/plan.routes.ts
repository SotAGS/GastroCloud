import { NextFunction, Request, Response, Router } from 'express';
import { param, validationResult } from 'express-validator';
import { env, isProduction } from '../config/env.config';
import { UserRole } from '../enums/user-role.enum';
import { requireAuth } from '../middlewares/auth.middleware';
import { requireRole } from '../middlewares/role.middleware';
import { SandboxPaymentService } from '../services/sandbox-payment.service';
import { HttpError } from '../utils/http-error.util';
import { hasSameOrigin } from '../utils/request-origin.util';

const router = Router();
const payments = new SandboxPaymentService();

router.use(requireAuth, requireRole(UserRole.ADMIN));

router.get('/', async (req, res, next) => {
  try {
    if (isProduction) throw new HttpError(403, 'El pago de prueba solo está disponible en desarrollo.');
    const { attempts, company } = await payments.list(req.session.user!);
    res.render('planes/index', {
      user: req.session.user,
      attempts,
      premiumExpiresAt: company.premiumExpiresAt,
      configured: Boolean(env.mercadoPagoTestAccessToken),
      confirmed: req.query.confirmed === '1',
    });
  } catch (error) {
    next(error);
  }
});

router.post('/pagos', async (req, res, next) => {
  try {
    if (!hasSameOrigin(req)) throw new HttpError(403, 'La solicitud no tiene un origen válido.');
    const checkoutUrl = await payments.create(req.session.user!);
    res.redirect(checkoutUrl);
  } catch (error) {
    next(error);
  }
});

router.post('/pagos/:id/confirmar', param('id').isUUID(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasSameOrigin(req)) throw new HttpError(403, 'La solicitud no tiene un origen válido.');
    if (!validationResult(req).isEmpty()) throw new HttpError(400, 'Pago de prueba inválido.');
    await payments.confirm(req.session.user!, String(req.params.id ?? ''));
    res.redirect('/planes?confirmed=1');
  } catch (error) {
    next(error);
  }
});

export default router;
