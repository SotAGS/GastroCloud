import { Router } from 'express';
import { ReportController } from '../controllers/report.controller';
import { requireAuth, requireSubscriptionPlan } from '../middlewares/auth.middleware';
import { requirePermission } from '../middlewares/permission.middleware';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';
import { SupportActivity } from '../models/support-activity.model';
import { getTenantScope } from '../utils/tenant-scope.util';

const router = Router();
const controller = new ReportController();

router.get('/soporte', requireAuth, requirePermission('reportes:view'), async (req, res, next) => {
  try {
    const { companyId } = getTenantScope(req.session.user);
    const pageValue = String(req.query.page ?? '1');
    const page = /^[1-9]\d{0,6}$/.test(pageValue) ? Number(pageValue) : 1;
    const pageSize = 100;
    const result = await SupportActivity.findAndCountAll({
      where: { companyId },
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    res.render('reportes/soporte', {
      user: req.session.user,
      activities: result.rows,
      page,
      hasNext: page * pageSize < result.count,
    });
  } catch (error) {
    next(error);
  }
});

router.get(
  '/',
  requireAuth,
  requireSubscriptionPlan(SubscriptionPlan.PREMIUM),
  requirePermission('reportes:view'),
  (req, res, next) => controller.index(req, res, next),
);

export default router;
