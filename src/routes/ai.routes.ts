import { NextFunction, Request, Response, Router } from 'express';
import { AIController } from '../controllers/ai.controller';
import { requireAuth, requireSubscriptionPlan } from '../middlewares/auth.middleware';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';

const router = Router();
const aiController = new AIController();

router.get(
  '/chat',
  requireAuth,
  requireSubscriptionPlan(SubscriptionPlan.PREMIUM),
  (req, res) => aiController.renderChat(req, res),
);

router.post(
  '/chat',
  requireAuth,
  requireSubscriptionPlan(SubscriptionPlan.PREMIUM),
  (req: Request, res: Response, next: NextFunction) => aiController.ask(req, res, next),
);

export default router;
