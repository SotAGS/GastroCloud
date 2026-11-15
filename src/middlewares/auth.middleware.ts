import { NextFunction, Request, Response } from 'express';
import { Local } from '../models/local.model';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';
import { hasCompanyAccess, hasLocalAccess } from '../services/account-policy.service';

// Protege rutas privadas; si no hay sesion redirige al login.
export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.session.user) {
    res.redirect('/auth/login');
    return;
  }

  req.user = req.session.user;
  next();
};

export const requireSubscriptionPlan = (...plans: SubscriptionPlan[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.session.support?.targetCompanyId) {
      next();
      return;
    }
    const plan = req.session.user?.subscriptionPlan ?? SubscriptionPlan.FREEMIUM;
    if (!plans.includes(plan as SubscriptionPlan)) {
      res.status(403).render('partials/error-page', {
        user: req.session.user ?? null,
        message: 'Esta funcionalidad requiere un plan superior.',
        details: ['Tu empresa no tiene acceso a esta funcionalidad con el plan actual.'],
      });
      return;
    }

    next();
  };
};

export const requireCompanyScope = (source: 'params' | 'body' | 'query' = 'params', fieldName = 'companyId') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const companyId = req[source]?.[fieldName] ?? req.session.user?.companyId;
    if (!hasCompanyAccess(req.session.user, companyId)) {
      res.status(403).render('partials/error-page', {
        user: req.session.user ?? null,
        message: 'No tienes acceso a la empresa indicada.',
        details: ['La información solicitada no pertenece a tu empresa.'],
      });
      return;
    }

    next();
  };
};

export const requireLocalScope = (source: 'params' | 'body' | 'query' = 'params', fieldName = 'localId') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const localId = req[source]?.[fieldName] ?? req.body?.localId ?? req.query?.localId;
    if (!localId) {
      res.status(400).render('partials/error-page', {
        user: req.session.user ?? null,
        message: 'Debe indicar un local válido.',
        details: [],
      });
      return;
    }

    const local = await Local.findByPk(String(localId));
    if (!local) {
      res.status(404).render('partials/error-page', {
        user: req.session.user ?? null,
        message: 'Local no encontrado.',
        details: [],
      });
      return;
    }

    if (!hasLocalAccess(req.session.user, local.toJSON(), req.session.user?.role)) {
      res.status(403).render('partials/error-page', {
        user: req.session.user ?? null,
        message: 'No tienes acceso a este local.',
        details: ['Los empleados solo pueden operar en su local asignado.'],
      });
      return;
    }

    next();
  };
};