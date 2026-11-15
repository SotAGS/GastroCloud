import { NextFunction, Request, Response, Router } from 'express';
import { SaleController } from '../controllers/sale.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { requirePermission } from '../middlewares/permission.middleware';
import { requireRole } from '../middlewares/role.middleware';
import { handleValidation } from '../middlewares/validation.middleware';
import { UserRole } from '../enums/user-role.enum';
import { createSaleValidator, saleIdValidator } from '../validators/sale.validator';

const router = Router();
const saleController = new SaleController();

router.get('/', requireAuth, requirePermission('ventas:view'), (req, res, next) => saleController.list(req, res, next));
router.get('/nueva', requireAuth, requirePermission('ventas:create'), (req, res, next) =>
  saleController.newForm(req, res, next),
);
router.post(
  '/',
  requireAuth,
  requirePermission('ventas:create'),
  createSaleValidator,
  handleValidation,
  (req: Request, res: Response, next: NextFunction) => saleController.create(req, res, next),
);
router.get(
  '/:id',
  requireAuth,
  saleIdValidator,
  handleValidation,
  requirePermission('ventas:view'),
  (req: Request, res: Response, next: NextFunction) => saleController.show(req, res, next),
);
router.post(
  '/:id/anular',
  requireAuth,
  requireRole(UserRole.ADMIN),
  saleIdValidator,
  handleValidation,
  (req: Request, res: Response, next: NextFunction) => saleController.cancel(req, res, next),
);

export default router;
