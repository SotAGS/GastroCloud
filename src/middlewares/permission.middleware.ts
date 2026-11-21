import { NextFunction, Request, Response } from 'express';
import { SecurityService } from '../services/security.service';

const securityService = new SecurityService();

export const loadNavigationPermissions = (req: Request, res: Response, next: NextFunction): void => {
  const user = req.session.user;
  res.locals.canNavigate = (permission: string): boolean =>
    Boolean(user?.role && (user.role === 'ADMIN' || user.permissions?.includes(permission)));
  next();
};

export const requirePermission = (permission: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const roleName = req.session.user?.role;
    const roleId = req.session.user?.roleId;
    const sessionPermissions = req.session.user?.permissions || [];

    if (!roleName) {
      res.status(401).render('partials/error-page', {
        user: req.session.user ?? null,
        message: 'Sesion invalida. Inicia sesion nuevamente.',
        details: [],
      });
      return;
    }

    if (roleName === 'ADMIN') {
      next();
      return;
    }

    if (sessionPermissions.includes(permission)) {
      next();
      return;
    }

    const hasPermission = roleId ? await securityService.roleHasPermission(roleId, permission) : false;
    if (!hasPermission) {
      res.status(403).render('partials/error-page', {
        user: req.session.user ?? null,
        message: `No tienes el permiso requerido: ${permission}`,
        details: [],
      });
      return;
    }

    next();
  };
};
