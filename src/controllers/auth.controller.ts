import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { AccountService } from '../services/account.service';
import { HttpError } from '../utils/http-error.util';
import { SupportAccount } from '../models/support-account.model';
import { Company } from '../models/company.model';

export class AuthController {
  private readonly authService = new AuthService();
  private readonly accountService = new AccountService();

  // Muestra el login; si ya existe una sesion activa, evita volver a autenticarse.
  showLogin(req: Request, res: Response): void {
    if (req.session.user) {
      res.redirect('/dashboard');
      return;
    }
    res.render('auth/login', {
      error: req.query.reason === 'support-session'
        ? 'Tu sesión anterior ya no es válida. Inicia sesión con una cuenta habilitada para soporte.'
        : req.query.reason === 'company-inactive'
          ? 'Tu empresa está desactivada. No es posible acceder a sus datos.'
          : null,
      usernameOrEmail: '',
      demoAccounts: res.locals.demoAccounts ?? null,
    });
  }

  showRegister(req: Request, res: Response): void {
    if (req.session.user) {
      res.redirect('/dashboard');
      return;
    }
    res.render('auth/register', {
      error: null,
    });
  }

  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const account = await this.accountService.registerCompany({
        fullName: String(req.body.fullName ?? ''),
        companyName: String(req.body.companyName ?? ''),
        localName: String(req.body.localName ?? 'Sucursal principal'),
        username: String(req.body.username ?? ''),
        email: String(req.body.email ?? ''),
        password: String(req.body.password ?? ''),
      });

      const user = await this.authService.login({
        usernameOrEmail: account.companyId ? String(req.body.username ?? '') : '',
        password: String(req.body.password ?? ''),
      });

      req.session.user = user;
      req.session.save((saveError) => {
        if (saveError) {
          next(saveError);
          return;
        }
        res.redirect('/dashboard');
      });
    } catch (error) {
      if (error instanceof HttpError) {
        res.status(error.statusCode).render('auth/register', {
          error: error.message,
        });
        return;
      }
      next(error);
    }
  }

  // Valida credenciales, persiste la sesion y redirige al dashboard.
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await this.authService.login(req.body);
      const support = await SupportAccount.findByPk(user.id);
      const company = user.companyId ? await Company.findByPk(user.companyId) : null;
      if (company?.isSupportOperator !== Boolean(support)) {
        throw new HttpError(403, 'La cuenta de soporte no está configurada correctamente.');
      }
      if (support && (!user.companyId || !user.localId)) {
        throw new HttpError(403, 'La cuenta de soporte no tiene una empresa y sucursal de origen válidas.');
      }
      req.session.regenerate((regenerateError) => {
        if (regenerateError) {
          next(regenerateError);
          return;
        }
        req.session.user = user;
        if (support && user.companyId && user.localId) {
          req.session.support = {
            homeCompanyId: user.companyId,
            homeLocalId: user.localId,
            targetCompanyId: null,
            canManageSupport: support.canManageSupport,
            mustChangePassword: Array.from(String(req.body.password)).length < 12
              || Buffer.byteLength(req.body.password, 'utf8') > 72,
          };
        }
        req.session.save((saveError) => {
          if (saveError) {
            next(saveError);
            return;
          }
          res.redirect(support ? '/soporte' : '/dashboard');
        });
      });
    } catch (error) {
      if (error instanceof HttpError && [401, 403].includes(error.statusCode)) {
        res.status(error.statusCode).render('auth/login', {
          error: error.message,
          usernameOrEmail: req.body.usernameOrEmail ?? '',
          demoAccounts: res.locals.demoAccounts ?? null,
        });
        return;
      }
      console.error('Error durante login:', error);
      next(error);
    }
  }

  // Cierra la sesion actual y regresa al formulario de acceso.
  logout(req: Request, res: Response): void {
    req.session.destroy(() => {
      res.redirect('/auth/login');
    });
  }
}