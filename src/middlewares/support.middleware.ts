import { NextFunction, Request, Response } from 'express';
import { Company, SupportAccount, SupportActivity, User } from '../models';
import { HttpError } from '../utils/http-error.util';
import { isProduction } from '../config/env.config';
import { getEffectiveSubscriptionPlan } from '../services/account-policy.service';
import { hasSameOrigin } from '../utils/request-origin.util';

export async function supportContext(req: Request, res: Response, next: NextFunction): Promise<void> {
  const support = req.session.support;
  const user = req.session.user;
  if (!user) {
    next();
    return;
  }

  try {
    if (!support) {
      const company = user.companyId ? await Company.findByPk(user.companyId) : null;
      if (company?.isSupportOperator) {
        req.session.destroy((error) => {
          if (error) next(error);
          else res.redirect('/auth/login?reason=support-session');
        });
        return;
      }
      if (!company?.isActive) {
        req.session.destroy((error) => {
          if (error) next(error);
          else res.redirect('/auth/login?reason=company-inactive');
        });
        return;
      }
      user.subscriptionPlan = getEffectiveSubscriptionPlan(
        company.subscriptionPlan,
        company.subscriptionStatus,
        company.premiumExpiresAt,
      );
      next();
      return;
    }

    const account = await SupportAccount.findByPk(user.id, { include: [{ model: User, required: true }] });
    const home = await Company.findByPk(support.homeCompanyId);
    if (!account || !account.user.isActive || account.user.companyId !== support.homeCompanyId
      || !home?.isSupportOperator || !home.isActive) {
      req.session.destroy((error) => {
        if (error) next(error);
        else res.status(403).send('La cuenta de soporte ya no está habilitada.');
      });
      return;
    }

    support.canManageSupport = account.canManageSupport;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (!hasSameOrigin(req)) {
        throw new HttpError(403, 'La solicitud de soporte no tiene un origen válido.');
      }
    }
    if (isProduction && support.mustChangePassword && req.path !== '/soporte/cambiar-clave' && req.path !== '/auth/logout') {
      res.redirect('/soporte/cambiar-clave');
      return;
    }

    if (support.targetCompanyId) {
      const company = await Company.findByPk(support.targetCompanyId);
      if (!company || company.isSupportOperator || company.id === support.homeCompanyId) {
        const isExit = req.method === 'POST' && (req.path === '/soporte/volver' || req.path === '/auth/logout');
        if (!isExit) {
          throw new HttpError(403, 'La empresa seleccionada ya no está disponible.');
        }
        if (req.path === '/auth/logout') {
          await SupportActivity.create({
            companyId: support.targetCompanyId,
            userId: user.id,
            userName: account.user.username,
            actorType: account.canManageSupport ? 'ADMIN_GC' : 'SOPORTE_GC',
            method: 'POST',
            path: '/auth/logout',
            action: 'SALIDA',
          });
        }
        next();
        return;
      }
      res.locals.supportCompanyName = company.name;
      user.companyId = company.id;
      user.localId = null;
      user.subscriptionPlan = getEffectiveSubscriptionPlan(
        company.subscriptionPlan,
        company.subscriptionStatus,
        company.premiumExpiresAt,
      );
      user.role = 'ADMIN';

      if (req.path === '/auth/logout' && req.method === 'POST') {
        await SupportActivity.create({
          companyId: company.id,
          userId: user.id,
          userName: account.user.username,
          actorType: account.canManageSupport ? 'ADMIN_GC' : 'SOPORTE_GC',
          method: 'POST',
          path: '/auth/logout',
          action: 'SALIDA',
        });
      }
      if (!req.path.startsWith('/soporte') && req.path !== '/auth/logout') {
        await SupportActivity.create({
          companyId: company.id,
          userId: user.id,
          userName: account.user.username,
          actorType: account.canManageSupport ? 'ADMIN_GC' : 'SOPORTE_GC',
          method: req.method,
          path: req.path.slice(0, 255),
          action: req.method === 'GET' || req.method === 'HEAD' ? 'CONSULTA' : 'INTENTO',
        });
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          throw new HttpError(403, 'El acceso de soporte a empresas es de solo lectura.');
        }
      }
    } else {
      user.companyId = support.homeCompanyId;
      user.localId = support.homeLocalId;
      if (!req.path.startsWith('/soporte') && req.path !== '/auth/logout') {
        res.redirect('/soporte');
        return;
      }
    }
    next();
  } catch (error) {
    next(error);
  }
}
