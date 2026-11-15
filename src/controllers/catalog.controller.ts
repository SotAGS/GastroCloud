import { NextFunction, Request, Response } from 'express';
import { CatalogService } from '../services/catalog.service';

export class CatalogController {
  private readonly catalogService = new CatalogService();

  async products(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const [products, categories, locals] = await Promise.all([
        this.catalogService.listProducts(req.session.user!),
        this.catalogService.listCategories(req.session.user!),
        this.catalogService.listBranches(req.session.user!),
      ]);
      res.render('catalogo/productos', { products, categories, locals, user: req.session.user, error: null });
    } catch (error) {
      next(error);
    }
  }

  async createProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.catalogService.createProduct(req.session.user!, {
        localId: String(req.body.localId ?? ''),
        categoryId: String(req.body.categoryId ?? ''),
        name: String(req.body.name ?? ''),
        sku: String(req.body.sku ?? ''),
        description: String(req.body.description ?? ''),
        unit: String(req.body.unit ?? ''),
        salePrice: Number(req.body.salePrice),
        initialQuantity: Number(req.body.initialQuantity ?? 0),
      });
      res.redirect('/catalogo/productos');
    } catch (error) {
      next(error);
    }
  }

  async updateProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.catalogService.updateProduct(req.session.user!, String(req.params.id), {
        localId: String(req.body.localId ?? ''),
        categoryId: String(req.body.categoryId ?? ''),
        name: String(req.body.name ?? ''),
        sku: String(req.body.sku ?? ''),
        description: String(req.body.description ?? ''),
        unit: String(req.body.unit ?? ''),
        salePrice: Number(req.body.salePrice),
        initialQuantity: 0,
        currentQuantity:
          req.body.currentQuantity === undefined || req.body.currentQuantity === ''
            ? undefined
            : Number(req.body.currentQuantity),
      });
      res.redirect('/catalogo/productos');
    } catch (error) {
      next(error);
    }
  }

  async setProductActive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const productId = String(req.params.id);
      if (req.body.isActive === 'true') await this.catalogService.reactivateProduct(req.session.user!, productId);
      else await this.catalogService.deactivateProduct(req.session.user!, productId);
      res.redirect('/catalogo/productos');
    } catch (error) {
      next(error);
    }
  }

  async permanentlyDeleteProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.catalogService.permanentlyDeleteProduct(req.session.user!, String(req.params.id));
      res.redirect('/catalogo/productos');
    } catch (error) {
      next(error);
    }
  }

  async categories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const [categories, locals] = await Promise.all([
        this.catalogService.listCategories(req.session.user!),
        this.catalogService.listBranches(req.session.user!),
      ]);
      res.render('catalogo/categorias', { categories, locals, user: req.session.user });
    } catch (error) {
      next(error);
    }
  }

  async createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.catalogService.createCategory(req.session.user!, {
        localId: String(req.body.localId ?? ''),
        name: String(req.body.name ?? ''),
        description: String(req.body.description ?? ''),
      });
      res.redirect('/catalogo/categorias');
    } catch (error) {
      next(error);
    }
  }

  async updateCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.catalogService.updateCategory(req.session.user!, String(req.params.id), {
        localId: String(req.body.localId ?? ''),
        name: String(req.body.name ?? ''),
        description: String(req.body.description ?? ''),
      });
      res.redirect('/catalogo/categorias');
    } catch (error) {
      next(error);
    }
  }

  async deactivateCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.catalogService.setCategoryActive(
        req.session.user!,
        String(req.params.id),
        req.body.isActive === 'true',
      );
      res.redirect('/catalogo/categorias');
    } catch (error) {
      next(error);
    }
  }

  async suppliers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const suppliers = await this.catalogService.listSuppliers(req.session.user!);
      res.render('catalogo/proveedores', { suppliers, user: req.session.user });
    } catch (error) {
      next(error);
    }
  }

  async createSupplier(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.catalogService.createSupplier(req.session.user!, this.supplierPayload(req));
      res.redirect('/catalogo/proveedores');
    } catch (error) {
      next(error);
    }
  }

  async updateSupplier(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.catalogService.updateSupplier(req.session.user!, String(req.params.id), this.supplierPayload(req));
      res.redirect('/catalogo/proveedores');
    } catch (error) {
      next(error);
    }
  }

  async setSupplierActive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.catalogService.setSupplierActive(
        req.session.user!,
        String(req.params.id),
        req.body.isActive === 'true',
      );
      res.redirect('/catalogo/proveedores');
    } catch (error) {
      next(error);
    }
  }

  private supplierPayload(req: Request) {
    return {
      businessName: String(req.body.businessName ?? ''),
      taxId: String(req.body.taxId ?? ''),
      email: String(req.body.email ?? ''),
      phone: String(req.body.phone ?? ''),
      address: String(req.body.address ?? ''),
    };
  }
}
