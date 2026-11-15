import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { UserRole } from '../enums/user-role.enum';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';
import { Company, Local, Role, User } from '../models';
import { HttpError } from '../utils/http-error.util';
import { sequelize } from '../config/database.config';
import { BootstrapSecurityService } from './bootstrap-security.service';

export interface RegisterCompanyInput {
  fullName: string;
  username: string;
  email: string;
  password: string;
  companyName: string;
  localName?: string;
}

export class AccountService {
  async registerCompany(payload: RegisterCompanyInput) {
    const fullName = payload.fullName.trim();
    const companyName = payload.companyName.trim();
    const localName = (payload.localName ?? 'Sucursal principal').trim() || 'Sucursal principal';
    const username = payload.username.trim();
    const email = payload.email.trim().toLowerCase();
    const password = payload.password;

    if (!fullName || !companyName || !username || !email || !password) {
      throw new HttpError(400, 'Todos los campos obligatorios deben completarse.');
    }

    const slugBase = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'empresa';
    const passwordHash = await bcrypt.hash(password, 10);
    return sequelize.transaction(async (transaction) => {
      const existingUser = await User.findOne({
        where: {
          [Op.or]: [{ username }, { email }],
        },
        transaction,
      });

      if (existingUser) {
        throw new HttpError(
          400,
          existingUser.username === username ? 'El nombre de usuario ya existe.' : 'El correo ya está registrado.',
        );
      }

      const role = await Role.findOne({ where: { name: UserRole.ADMIN, companyId: null }, transaction });
      if (!role) {
        throw new HttpError(500, 'No existe el rol administrador del sistema.');
      }

      const company = await Company.create(
        {
          name: companyName,
          slug: `${slugBase}-${crypto.randomUUID()}`,
          subscriptionPlan: SubscriptionPlan.FREEMIUM,
          subscriptionStatus: 'ACTIVE',
          isActive: true,
        },
        { transaction },
      );

      const local = await Local.create(
        {
          companyId: company.id,
          name: localName,
          address: null,
          isActive: true,
        },
        { transaction },
      );

      await BootstrapSecurityService.ensureCompanyRoles(company.id, transaction);

      const user = await User.create(
        {
          fullName,
          username,
          email,
          passwordHash,
          roleId: role.id,
          companyId: company.id,
          localId: local.id,
          isActive: true,
        },
        { transaction },
      );

      return {
        id: user.id,
        companyId: company.id,
        localId: local.id,
        subscriptionPlan: company.subscriptionPlan,
      };
    });
  }
}
