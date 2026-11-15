import { NextFunction, Request, Response } from 'express';
import { SaleService } from '../services/sale.service';

export class SaleController {
  private readonly saleService = new SaleService();

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sales = await this.saleService.listSales(req.session.user!);
      res.render('ventas/index', { sales, user: req.session.user });
    } catch (error) {
      next(error);
    }
  }

  async newForm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const products = await this.saleService.listAvailableProducts(req.session.user!);
      res.render('ventas/new', { products, user: req.session.user, error: null });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sale = await this.saleService.createSale(req.body, req.session.user!);
      res.redirect(`/ventas/${sale.id}`);
    } catch (error) {
      next(error);
    }
  }

  async show(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sale = await this.saleService.getById(String(req.params.id), req.session.user!);
      res.render('ventas/show', { sale, user: req.session.user });
    } catch (error) {
      next(error);
    }
  }

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sale = await this.saleService.cancelSale(String(req.params.id), req.session.user!);
      res.redirect(`/ventas/${sale.id}`);
    } catch (error) {
      next(error);
    }
  }
}
