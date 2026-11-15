import { Request } from 'express';

export function hasSameOrigin(req: Request): boolean {
  const origin = req.get('origin');
  return Boolean(origin && origin === `${req.protocol}://${req.get('host')}`);
}
