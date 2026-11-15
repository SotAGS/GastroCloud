import { AuthUser } from '../../interfaces/auth-user.interface';

declare module 'express-session' {
  interface SessionData {
    user?: AuthUser;
    support?: {
      homeCompanyId: string;
      homeLocalId: string;
      targetCompanyId: string | null;
      canManageSupport: boolean;
      mustChangePassword: boolean;
    };
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};