import { NextFunction, Request, Response } from 'express';
import { BusinessIntelligenceService } from '../services/business-intelligence.service';
import { HttpError } from '../utils/http-error.util';

export class AIController {
  async renderChat(req: Request, res: Response): Promise<void> {
    res.render('ai/chat', {
      user: req.session.user,
      question: '',
      answer: null,
      error: null,
    });
  }

  async ask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const question = String(req.body.question ?? '').trim();
      if (!question) {
        res.status(400).render('ai/chat', {
          user: req.session.user,
          question: '',
          answer: null,
          error: 'Debes escribir una pregunta para el asistente.',
        });
        return;
      }

      const answer = await BusinessIntelligenceService.ask(req.session.user, question);
      res.render('ai/chat', {
        user: req.session.user,
        question,
        answer,
        error: null,
      });
    } catch (error) {
      if (error instanceof HttpError) {
        res.status(error.statusCode).render('ai/chat', {
          user: req.session.user,
          question: String(req.body.question ?? ''),
          answer: null,
          error: error.message,
        });
        return;
      }
      next(error);
    }
  }
}
