import { NextFunction, Request, Response } from 'express';
import { SecurityService } from '../services/security.service';
import { HttpError } from '../utils/http-error.util';
import bcrypt from 'bcrypt';
import { User } from '../models';

export class SecurityController {
  private readonly securityService = new SecurityService();

  private async renderDashboard(
    req: Request,
    res: Response,
    statusCode = 200,
    error: string | null = null,
    createUserForm: Record<string, string | boolean> | null = null,
  ): Promise<void> {
    const companyId = req.session.user?.companyId;
    if (!companyId) {
      throw new HttpError(403, 'La cuenta no está asociada a una empresa.');
    }
    const data = await this.securityService.securityDashboard(companyId, req.session.user?.role);

    res.status(statusCode).render('seguridad/usuarios', {
      user: req.session.user,
      users: data.users,
      roles: data.roles,
      assignableRoles: data.assignableRoles,
      locals: data.locals,
      canManageRoles: data.canManageRoles && (
        req.session.user?.subscriptionPlan === 'PREMIUM' || Boolean(req.session.support?.targetCompanyId)
      ),
      availablePermissions: data.availablePermissions,
      error,
      createUserForm,
    });
  }

  async dashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.renderDashboard(req, res);
    } catch (error) {
      next(error);
    }
  }

  async createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.securityService.createUser(
        {
          fullName: String(req.body.fullName ?? ''),
          username: String(req.body.username ?? ''),
          email: String(req.body.email ?? ''),
          password: String(req.body.password ?? ''),
          roleId: String(req.body.roleId ?? ''),
          companyId: String(req.body.companyId ?? req.session.user?.companyId ?? ''),
          localId: String(req.body.localId ?? req.session.user?.localId ?? ''),
          isActive: req.body.isActive === 'on',
        },
        {
          companyId: req.session.user?.companyId ?? null,
          subscriptionPlan: req.session.user?.subscriptionPlan ?? null,
          role: req.session.user?.role ?? '',
        },
      );

      res.redirect('/seguridad');
    } catch (error) {
      if (error instanceof HttpError) {
        try {
          await this.renderDashboard(req, res, error.statusCode, error.message, {
            fullName: String(req.body.fullName ?? ''),
            username: String(req.body.username ?? ''),
            email: String(req.body.email ?? ''),
            roleId: String(req.body.roleId ?? ''),
            localId: String(req.body.localId ?? ''),
            isActive: req.body.isActive === 'on',
          });
        } catch (renderError) {
          next(renderError);
        }
        return;
      }
      next(error);
    }
  }

  async updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.securityService.updateUser(String(req.params.id), {
        fullName: String(req.body.fullName ?? ''),
        username: String(req.body.username ?? ''),
        email: String(req.body.email ?? ''),
        roleId: String(req.body.roleId ?? ''),
        localId: String(req.body.localId ?? ''),
        isActive: req.body.isActive === 'on',
        password: req.body.password ? String(req.body.password) : undefined,
      }, String(req.session.user?.companyId ?? ''), req.session.user?.role);

      res.redirect('/seguridad');
    } catch (error) {
      next(error);
    }
  }

  async deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.securityService.deleteUser(
        String(req.params.id),
        String(req.session.user?.companyId ?? ''),
        req.session.user?.role,
      );
      res.redirect('/seguridad');
    } catch (error) {
      next(error);
    }
  }

  async updateUserSecurity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = String(req.params.id);
      await this.securityService.updateUserSecurity(userId, {
        roleId: String(req.body.roleId ?? ''),
        isActive: req.body.isActive === 'on',
      }, String(req.session.user?.companyId ?? ''), req.session.user?.role);
      res.redirect('/seguridad');
    } catch (error) {
      if (error instanceof HttpError) {
        try {
          await this.renderDashboard(req, res, error.statusCode, error.message);
        } catch (renderError) {
          next(renderError);
        }
        return;
      }
      next(error);
    }
  }

  async createRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.securityService.createRole({
        name: String(req.body.name ?? ''),
        description: String(req.body.description ?? ''),
      }, String(req.session.user?.companyId ?? ''));
      res.redirect('/seguridad');
    } catch (error) {
      next(error);
    }
  }

  async updateRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.securityService.updateRole(String(req.params.id), {
        name: String(req.body.name ?? ''),
        description: String(req.body.description ?? ''),
      }, String(req.session.user?.companyId ?? ''));
      res.redirect('/seguridad');
    } catch (error) {
      next(error);
    }
  }

  async deleteRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.securityService.deleteRole(String(req.params.id), String(req.session.user?.companyId ?? ''));
      res.redirect('/seguridad');
    } catch (error) {
      next(error);
    }
  }

  async updateRolePermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawPermissions = req.body.permissions;
      const permissions = Array.isArray(rawPermissions)
        ? rawPermissions.map(String)
        : rawPermissions
        ? [String(rawPermissions)]
        : [];

      await this.securityService.updateRolePermissions(
        String(req.params.id),
        { permissions },
        String(req.session.user?.companyId ?? ''),
      );
      res.redirect('/seguridad');
    } catch (error) {
      next(error);
    }
  }

  async resetEmployeePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.session.user?.companyId;
      const user = companyId ? await User.findOne({ where: { username: 'empleado', companyId } }) : null;
      if (!user) {
        throw new HttpError(404, 'Usuario empleado no encontrado.');
      }

      user.passwordHash = await bcrypt.hash('empleado123', 10);
      user.isActive = true;
      await user.save();

      res.redirect('/seguridad');
    } catch (error) {
      next(error);
    }
  }
}
