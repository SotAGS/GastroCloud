import { Router } from 'express';
import authRoutes from './auth.routes';
import dashboardRoutes from './dashboard.routes';
import purchaseRoutes from './purchase.routes';
import stockRoutes from './stock.routes';
import securityRoutes from './security.routes';
import aiRoutes from './ai.routes';
import saleRoutes from './sale.routes';
import catalogRoutes from './catalog.routes';
import reportRoutes from './report.routes';
import supportRoutes from './support.routes';
import companyRoutes from './company.routes';
import planRoutes from './plan.routes';

const router = Router();

router.get('/', (_req, res) => {
  res.redirect('/dashboard');
});

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/compras', purchaseRoutes);
router.use('/stock', stockRoutes);
router.use('/seguridad', securityRoutes);
router.use('/ia', aiRoutes);
router.use('/ventas', saleRoutes);
router.use('/catalogo', catalogRoutes);
router.use('/reportes', reportRoutes);
router.use('/soporte', supportRoutes);
router.use('/empresa', companyRoutes);
router.use('/planes', planRoutes);

export default router;