import { NextFunction, Request, Response, Router } from 'express';
import { SecurityController } from '../controllers/security.controller';
import { requireAuth, requireSubscriptionPlan } from '../middlewares/auth.middleware';
import { requireRole } from '../middlewares/role.middleware';
import { requirePermission } from '../middlewares/permission.middleware';
import { UserRole } from '../enums/user-role.enum';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';
import {
  createRoleValidator,
  createUserValidator,
  updateRolePermissionsValidator,
  updateRoleValidator,
  updateUserSecurityValidator,
  updateUserValidator,
} from '../validators/security.validator';
import { handleValidation } from '../middlewares/validation.middleware';

const router = Router();
const securityController = new SecurityController();

const requirePremiumOrCompanyAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (
    req.session.support?.targetCompanyId ||
    req.session.user?.subscriptionPlan === SubscriptionPlan.PREMIUM ||
    req.session.user?.role === UserRole.ADMIN
  ) {
    next();
    return;
  }

  res.status(403).render('partials/error-page', {
    user: req.session.user ?? null,
    message: 'La gestión de usuarios requiere Premium o una cuenta administradora.',
    details: [],
  });
};

router.use(requireAuth, requirePremiumOrCompanyAdmin);

router.get(
  '/',
  requireAuth,
  requirePermission('seguridad:view'),
  (req, res, next) => securityController.dashboard(req, res, next),
);

router.get('/usuarios', requireAuth, requirePermission('seguridad:view'), (req, res) => {
  res.redirect('/seguridad');
});

router.post(
  '/usuarios',
  requireAuth,
  requirePermission('seguridad:manage-users'),
  createUserValidator,
  handleValidation,
  (req: Request, res: Response, next: NextFunction) => securityController.createUser(req, res, next),
);

router.put(
  '/usuarios/:id',
  requireAuth,
  requirePermission('seguridad:manage-users'),
  updateUserValidator,
  handleValidation,
  (req: Request, res: Response, next: NextFunction) => securityController.updateUser(req, res, next),
);

router.delete('/usuarios/:id', requireAuth, requirePermission('seguridad:manage-users'), (req, res, next) =>
  securityController.deleteUser(req, res, next),
);

router.patch(
  '/usuarios/:id/seguridad',
  requireAuth,
  requirePermission('seguridad:manage-users'),
  updateUserSecurityValidator,
  handleValidation,
  (req: Request, res: Response, next: NextFunction) => securityController.updateUserSecurity(req, res, next),
);

router.post('/usuarios/empleado/reset-password', requireAuth, requireSubscriptionPlan(SubscriptionPlan.PREMIUM), requireRole(UserRole.ADMIN), requirePermission('seguridad:manage-users'), (req, res, next) =>
  securityController.resetEmployeePassword(req, res, next),
);

router.post(
  '/roles',
  requireAuth,
  requireSubscriptionPlan(SubscriptionPlan.PREMIUM),
  requireRole(UserRole.ADMIN),
  requirePermission('seguridad:manage-roles'),
  createRoleValidator,
  handleValidation,
  (req: Request, res: Response, next: NextFunction) => securityController.createRole(req, res, next),
);

router.put(
  '/roles/:id',
  requireAuth,
  requireSubscriptionPlan(SubscriptionPlan.PREMIUM),
  requireRole(UserRole.ADMIN),
  requirePermission('seguridad:manage-roles'),
  updateRoleValidator,
  handleValidation,
  (req: Request, res: Response, next: NextFunction) => securityController.updateRole(req, res, next),
);

router.delete('/roles/:id', requireAuth, requireSubscriptionPlan(SubscriptionPlan.PREMIUM), requireRole(UserRole.ADMIN), requirePermission('seguridad:manage-roles'), (req, res, next) =>
  securityController.deleteRole(req, res, next),
);

router.patch(
  '/roles/:id/permisos',
  requireAuth,
  requireSubscriptionPlan(SubscriptionPlan.PREMIUM),
  requireRole(UserRole.ADMIN),
  requirePermission('seguridad:manage-permissions'),
  updateRolePermissionsValidator,
  handleValidation,
  (req: Request, res: Response, next: NextFunction) => securityController.updateRolePermissions(req, res, next),
);

export default router;
