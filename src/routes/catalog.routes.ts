import { NextFunction, Request, Response, Router } from 'express';
import { CatalogController } from '../controllers/catalog.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { requirePermission } from '../middlewares/permission.middleware';
import { handleValidation } from '../middlewares/validation.middleware';
import {
  catalogIdValidator,
  activeStateValidator,
  categoryValidator,
  productValidator,
  supplierValidator,
} from '../validators/catalog.validator';

const router = Router();
const controller = new CatalogController();
const read = [requireAuth, requirePermission('catalog:read')];
const manageProducts = [requireAuth, requirePermission('catalog:manage-products')];
const manageCategories = [requireAuth, requirePermission('catalog:manage-categories')];
const manageSuppliers = [requireAuth, requirePermission('catalog:manage-suppliers')];

router.get('/productos', ...read, (req, res, next) => controller.products(req, res, next));
router.post('/productos', ...manageProducts, productValidator, handleValidation, (req: Request, res: Response, next: NextFunction) =>
  controller.createProduct(req, res, next),
);
router.put('/productos/:id', ...manageProducts, catalogIdValidator, productValidator, handleValidation, (req: Request, res: Response, next: NextFunction) =>
  controller.updateProduct(req, res, next),
);
router.patch('/productos/:id/estado', ...manageProducts, catalogIdValidator, activeStateValidator, handleValidation, (req: Request, res: Response, next: NextFunction) =>
  controller.setProductActive(req, res, next),
);
router.delete('/productos/:id', ...manageProducts, catalogIdValidator, handleValidation, (req: Request, res: Response, next: NextFunction) =>
  controller.permanentlyDeleteProduct(req, res, next),
);

router.get('/categorias', ...read, (req, res, next) => controller.categories(req, res, next));
router.post('/categorias', ...manageCategories, categoryValidator, handleValidation, (req: Request, res: Response, next: NextFunction) =>
  controller.createCategory(req, res, next),
);
router.put('/categorias/:id', ...manageCategories, catalogIdValidator, categoryValidator, handleValidation, (req: Request, res: Response, next: NextFunction) =>
  controller.updateCategory(req, res, next),
);
router.patch('/categorias/:id/estado', ...manageCategories, catalogIdValidator, activeStateValidator, handleValidation, (req: Request, res: Response, next: NextFunction) =>
  controller.deactivateCategory(req, res, next),
);

router.get('/proveedores', ...read, (req, res, next) => controller.suppliers(req, res, next));
router.post('/proveedores', ...manageSuppliers, supplierValidator, handleValidation, (req: Request, res: Response, next: NextFunction) =>
  controller.createSupplier(req, res, next),
);
router.put('/proveedores/:id', ...manageSuppliers, catalogIdValidator, supplierValidator, handleValidation, (req: Request, res: Response, next: NextFunction) =>
  controller.updateSupplier(req, res, next),
);
router.patch('/proveedores/:id/estado', ...manageSuppliers, catalogIdValidator, activeStateValidator, handleValidation, (req: Request, res: Response, next: NextFunction) =>
  controller.setSupplierActive(req, res, next),
);

export default router;
