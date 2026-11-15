import bcrypt from 'bcrypt';
import { Role } from '../models/role.model';
import { User } from '../models/user.model';
import { RolePermission } from '../models/role-permission.model';
import { UserRole } from '../enums/user-role.enum';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';
import { Company } from '../models/company.model';
import { Local } from '../models/local.model';
import { env, isProduction } from '../config/env.config';
import { Transaction } from 'sequelize';

interface DemoAccount {
  role: UserRole;
  username: string;
  password: string;
}

const demoAccounts: DemoAccount[] = [
  {
    role: UserRole.ADMIN,
    username: env.demoAdminUsername,
    password: env.demoAdminPassword,
  },
  {
    role: UserRole.EMPLEADO,
    username: env.demoEmployeeUsername,
    password: env.demoEmployeePassword,
  },
];

export class BootstrapSecurityService {
  private static readonly defaultPermissionsByRole: Record<string, string[]> = {
    ADMIN: [
      'dashboard:view',
      'ventas:view',
      'ventas:create',
      'compras:view',
      'compras:create',
      'compras:update-status',
      'stock:view',
      'seguridad:view',
      'seguridad:manage-users',
      'seguridad:manage-roles',
      'seguridad:manage-permissions',
    ],
    GERENTE: [
      'dashboard:view',
      'catalog:read',
      'catalog:manage-products',
      'catalog:manage-categories',
      'catalog:manage-suppliers',
      'seguridad:view',
      'seguridad:manage-users',
      'reportes:view',
    ],
    CONTADOR: ['dashboard:view', 'reportes:view'],
    EMPLEADO: ['dashboard:view', 'ventas:view', 'ventas:create', 'stock:view'],
  };

  static getDemoAccounts(): DemoAccount[] {
    return isProduction ? [] : demoAccounts;
  }

  static getDefaultPermissionsForRole(roleName: string): string[] {
    return [...(this.defaultPermissionsByRole[roleName] ?? [])];
  }

  private static async ensureRolePermissions(role: Role, transaction?: Transaction): Promise<void> {
    const expected = this.getDefaultPermissionsForRole(role.name);
    if (expected.length === 0) {
      return;
    }

    const existing = await RolePermission.findAll({ where: { roleId: role.id }, transaction });
    const existingPermissions = new Set(existing.map((permission) => `${permission.module}:${permission.action}`));
    const missingPermissions = expected.filter((permission) => !existingPermissions.has(permission));
    if (missingPermissions.length === 0) return;

    await RolePermission.bulkCreate(
      missingPermissions.map((permission) => {
        const [module, action] = permission.split(':');
        return {
          roleId: role.id,
          module,
          action,
        };
      }),
      { transaction },
    );
  }

  static async ensureCompanyRoles(companyId: string, transaction?: Transaction): Promise<void> {
    for (const [name, description] of [
      [UserRole.GERENTE, 'Administra catálogo, usuarios y reportes de la empresa.'],
      [UserRole.CONTADOR, 'Consulta reportes de la empresa.'],
    ] as const) {
      const [role] = await Role.findOrCreate({
        where: { name, companyId },
        defaults: { name, companyId, description },
        transaction,
      });
      await this.ensureRolePermissions(role, transaction);
    }
  }

  static async ensureBaseSecurityData(): Promise<void> {
    const [adminRole] = await Role.findOrCreate({
      where: { name: UserRole.ADMIN, companyId: null },
      defaults: {
        companyId: null,
        description: 'Administrador con control total del sistema.',
      },
    });

    const [employeeRole] = await Role.findOrCreate({
      where: { name: UserRole.EMPLEADO, companyId: null },
      defaults: {
        companyId: null,
        description: 'Usuario operativo con acceso limitado.',
      },
    });

    await this.ensureRolePermissions(adminRole);
    await this.ensureRolePermissions(employeeRole);

    const [company] = await Company.findOrCreate({
      where: { slug: 'gastrocloud-demo' },
      defaults: {
        name: 'GastroCloud Demo',
        slug: 'gastrocloud-demo',
        subscriptionPlan: SubscriptionPlan.PREMIUM,
        subscriptionStatus: 'ACTIVE',
        isActive: true,
      },
    });

    const [local] = await Local.findOrCreate({
      where: { companyId: company.id, name: 'Sucursal Central' },
      defaults: {
        companyId: company.id,
        name: 'Sucursal Central',
        address: 'Calle principal 123',
        isActive: true,
      },
    });

    const companies = await Company.findAll({ attributes: ['id'] });
    for (const tenantCompany of companies) {
      await this.ensureCompanyRoles(tenantCompany.id);
    }

    const totalUsers = await User.count();
    if (totalUsers > 0 || isProduction) {
      return;
    }

    const adminHash = await bcrypt.hash(env.demoAdminPassword, 10);
    const employeeHash = await bcrypt.hash(env.demoEmployeePassword, 10);

    await User.create({
      roleId: adminRole.id,
      companyId: company.id,
      localId: local.id,
      fullName: 'Administrador Demo',
      username: env.demoAdminUsername,
      email: env.demoAdminEmail,
      passwordHash: adminHash,
      isActive: true,
    });

    await User.create({
      roleId: employeeRole.id,
      companyId: company.id,
      localId: local.id,
      fullName: 'Empleado Demo',
      username: env.demoEmployeeUsername,
      email: env.demoEmployeeEmail,
      passwordHash: employeeHash,
      isActive: true,
    });

    console.log('Usuarios demo creados.');
  }
}
