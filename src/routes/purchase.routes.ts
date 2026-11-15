import { NextFunction, Request, Response, Router } from 'express';
import { PurchaseController } from '../controllers/purchase.controller';
import { requireAuth, requireSubscriptionPlan } from '../middlewares/auth.middleware';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';
import { requireRole } from '../middlewares/role.middleware';
import { requirePermission } from '../middlewares/permission.middleware';
import { createPurchaseValidator } from '../validators/purchase.validator';
import { handleValidation } from '../middlewares/validation.middleware';
import { UserRole } from '../enums/user-role.enum';

const router = Router();
const purchaseController = new PurchaseController();

router.use(requireAuth, requireSubscriptionPlan(SubscriptionPlan.PREMIUM));

router.get('/', requireAuth, requirePermission('compras:view'), (req, res, next) => purchaseController.list(req, res, next));
router.get(
  '/nueva',
  requireAuth,
  requirePermission('compras:create'),
  requireRole(UserRole.ADMIN),
  (req, res, next) => purchaseController.newForm(req, res, next),
);
router.post(
  '/',
  requireAuth,
  requirePermission('compras:create'),
  requireRole(UserRole.ADMIN),
  createPurchaseValidator,
  handleValidation,
  (req: Request, res: Response, next: NextFunction) => purchaseController.create(req, res, next),
);
router.get('/:id', requireAuth, requirePermission('compras:view'), (req, res, next) => purchaseController.show(req, res, next));
router.post(
  '/:id/estado/recibir',
  requireAuth,
  requirePermission('compras:update-status'),
  requireRole(UserRole.ADMIN),
  (req, res, next) =>
  purchaseController.markReceived(req, res, next),
);
router.post(
  '/:id/estado/cancelar',
  requireAuth,
  requirePermission('compras:update-status'),
  requireRole(UserRole.ADMIN),
  (req, res, next) =>
  purchaseController.markCancelled(req, res, next),
);

export default router;