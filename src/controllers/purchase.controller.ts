import { NextFunction, Request, Response } from 'express';
import { PurchaseStatus } from '../enums/purchase-status.enum';
import { PurchaseService } from '../services/purchase.service';
import { CatalogService } from '../services/catalog.service';

export class PurchaseController {
  private readonly purchaseService = new PurchaseService();
  private readonly catalogService = new CatalogService();

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const purchases = await this.purchaseService.listPurchases(req.session.user!);
      res.render('compras/index', { purchases, user: req.session.user });
    } catch (error) {
      next(error);
    }
  }

  async newForm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { suppliers, products } = await this.catalogService.getPurchaseFormData(req.session.user!);
      res.render('compras/new', { user: req.session.user, suppliers, products });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const purchase = await this.purchaseService.createPurchase(req.body, req.session.user!);
      res.redirect(`/compras/${purchase.id}`);
    } catch (error) {
      next(error);
    }
  }

  async show(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const purchaseId = String(req.params.id);
      const purchase = await this.purchaseService.getById(purchaseId, req.session.user!);
      res.render('compras/show', { purchase, user: req.session.user });
    } catch (error) {
      next(error);
    }
  }

  async markReceived(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const purchaseId = String(req.params.id);
      await this.purchaseService.changeStatus(purchaseId, PurchaseStatus.RECIBIDA, req.session.user!);
      res.redirect(`/compras/${purchaseId}`);
    } catch (error) {
      next(error);
    }
  }

  async markCancelled(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const purchaseId = String(req.params.id);
      await this.purchaseService.changeStatus(purchaseId, PurchaseStatus.CANCELADA, req.session.user!);
      res.redirect(`/compras/${purchaseId}`);
    } catch (error) {
      next(error);
    }
  }
}