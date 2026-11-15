import { NextFunction, Request, Response } from 'express';
import { ReportService } from '../services/report.service';

export class ReportController {
  private readonly reportService = new ReportService();

  async index(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const report = await this.reportService.getCompanyReport(req.session.user!);
      res.render('reportes/index', { report, user: req.session.user });
    } catch (error) {
      next(error);
    }
  }
}
