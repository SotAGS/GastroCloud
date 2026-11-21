import bcrypt from 'bcrypt';
import { Op } from 'sequelize';
import { Role, RolePermission, User, Company, Local } from '../models';
import { UserRepository } from '../repositories/user.repository';
import { HttpError } from '../utils/http-error.util';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';
import { UserRole } from '../enums/user-role.enum';
import { sequelize } from '../config/database.config';

interface UpdateUserSecurityPayload {
  roleId: string;
  isActive: boolean;
}

interface CreateUserPayload {
  fullName: string;
  username: string;
  email: string;
  password: string;
  roleId: string;
  companyId?: string | null;
  localId?: string | null;
  isActive: boolean;
}

interface UpdateUserPayload {
  fullName: string;
  username: string;
  email: string;
  roleId: string;
  localId: string;
  isActive: boolean;
  password?: string;
}

interface CreateRolePayload {
  name: string;
  description?: string;
}

interface UpdateRolePayload {
  name: string;
  description?: string;
}

interface UpdateRolePermissionsPayload {
  permissions: string[];
}

const DEFAULT_PERMISSIONS = [
  'dashboard:view',
  'ventas:view',
  'ventas:create',
  'compras:view',
  'compras:create',
  'compras:update-status',
  'stock:view',
  'catalog:read',
  'catalog:manage-products',
  'catalog:manage-categories',
  'catalog:manage-suppliers',
  'reportes:view',
  'seguridad:view',
  'seguridad:manage-users',
  'seguridad:manage-roles',
  'seguridad:manage-permissions',
] as const;

const FREEMIUM_MAX_USERS = 2;

export class SecurityService {
  private readonly userRepository = new UserRepository();

  // Catalogo base de permisos disponibles para asignar a roles.
  static getDefaultPermissions(): string[] {
    return [...DEFAULT_PERMISSIONS];
  }

  async securityDashboard(companyId: string, actorRole: string = UserRole.ADMIN) {
    const users = await this.listUsers(companyId);
    const roles = await this.listRoles(companyId, actorRole !== UserRole.ADMIN);
    const locals = await Local.findAll({ where: { companyId, isActive: true }, order: [['name', 'ASC']] });
    const assignableRoles =
      actorRole !== UserRole.ADMIN
        ? roles.filter(
            (role) =>
                role.companyId === companyId &&
                [UserRole.EMPLEADO, UserRole.GERENTE, UserRole.CONTADOR].includes(role.name as UserRole),
          )
        : roles;
    return {
      users,
      roles,
      assignableRoles,
      locals,
      canManageRoles: actorRole === UserRole.ADMIN,
      availablePermissions: SecurityService.getDefaultPermissions(),
    };
  }

  async listUsers(companyId: string) {
    const users = await this.userRepository.listWithRole(companyId);
    return users.map((user) => ({
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      companyId: user.companyId,
      localId: user.localId,
      localName: user.local?.name ?? null,
      isActive: user.isActive,
      roleId: user.roleId,
      roleName: user.role?.name ?? null,
      lastLoginAt: user.lastLoginAt,
    }));
  }

  async listRoles(companyId: string, excludeGlobalAdmin = false) {
    const roles = await Role.findAll({
      where: {
        [Op.or]: [{ companyId }, ...(excludeGlobalAdmin ? [] : [{ companyId: null, name: UserRole.ADMIN }])],
      },
      include: [{ model: RolePermission }],
      order: [['name', 'ASC']],
    });

    return roles.map((role) => ({
      id: role.id,
      companyId: role.companyId,
      name: role.name,
      description: role.description,
      permissions: (role.permissions || [])
        .map((permission) => `${permission.module}:${permission.action}`)
        .sort((a, b) => a.localeCompare(b)),
    }));
  }

  async createUser(
    payload: CreateUserPayload,
    actor: { companyId: string | null; subscriptionPlan: string | null; role: string },
  ): Promise<void> {
    if (
      actor.subscriptionPlan !== SubscriptionPlan.FREEMIUM &&
      actor.subscriptionPlan !== SubscriptionPlan.PREMIUM
    ) {
      throw new HttpError(403, 'El plan actual no permite crear usuarios.');
    }
    if (actor.subscriptionPlan === SubscriptionPlan.FREEMIUM && actor.role !== UserRole.ADMIN) {
      throw new HttpError(403, 'Solo el administrador de la empresa puede crear usuarios en Freemium.');
    }

    const requestedCompanyId = payload.companyId ?? actor.companyId;
    if (!actor.companyId || requestedCompanyId !== actor.companyId) {
      throw new HttpError(403, 'No puedes crear usuarios fuera de tu empresa.');
    }

    await this.ensureUniqueUserFields(payload.username, payload.email);

    const passwordHash = await bcrypt.hash(payload.password, 10);

    await sequelize.transaction(async (transaction) => {
      const company = await Company.findByPk(requestedCompanyId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!company) {
        throw new HttpError(404, 'Empresa no encontrada.');
      }

      if (actor.subscriptionPlan === SubscriptionPlan.FREEMIUM) {
        const userCount = await User.count({ where: { companyId: company.id }, transaction });
        if (userCount >= FREEMIUM_MAX_USERS) {
          throw new HttpError(403, 'El plan Freemium permite un máximo de 2 usuarios.');
        }
      }

      const local = payload.localId
        ? await Local.findOne({ where: { id: payload.localId, companyId: company.id, isActive: true }, transaction })
        : null;
      if (!local) {
        throw new HttpError(400, 'El local indicado no pertenece a la empresa actual.');
      }

      const role = await Role.findByPk(payload.roleId, { transaction });
      if (!role || !this.canAssignRoleToCompany(role, company.id, actor.role)) {
        throw new HttpError(400, 'Rol invalido.');
      }

      await User.create({
        fullName: payload.fullName,
        username: payload.username,
        email: payload.email,
        passwordHash,
        roleId: payload.roleId,
        companyId: company.id,
        localId: local.id,
        isActive: payload.isActive,
      }, { transaction });
    });
  }

  async updateUser(userId: string, payload: UpdateUserPayload, companyId: string, actorRole: string = UserRole.ADMIN): Promise<void> {
    const user = await this.userRepository.findById(userId, companyId);
    if (!user) {
      throw new HttpError(404, 'Usuario no encontrado.');
    }

    await this.ensureUniqueUserFields(payload.username, payload.email, user.id);

    const role = await Role.findByPk(payload.roleId);
    if (!role || !this.canAssignRoleToCompany(role, companyId, actorRole, user.roleId)) {
      throw new HttpError(400, 'Rol invalido.');
    }
    this.preventManagerAdminChange(actorRole, user.role?.name ?? null);
    const local = await Local.findOne({ where: { id: payload.localId, companyId, isActive: true } });
    if (!local) throw new HttpError(400, 'El local indicado no pertenece a la empresa actual.');

    await this.guardLastAdminRule(user.id, user.companyId, user.role?.name ?? null, role.name, payload.isActive);

    const updateValues: Partial<User> & { passwordHash?: string } = {
      fullName: payload.fullName,
      username: payload.username,
      email: payload.email,
      roleId: payload.roleId,
      localId: local.id,
      isActive: payload.isActive,
    };

    if (payload.password && payload.password.trim()) {
      updateValues.passwordHash = await bcrypt.hash(payload.password, 10);
    }

    await User.update(updateValues, { where: { id: user.id, companyId } });
  }

  async deleteUser(userId: string, companyId: string, actorRole: string = UserRole.ADMIN): Promise<void> {
    const user = await this.userRepository.findById(userId, companyId);
    if (!user) {
      throw new HttpError(404, 'Usuario no encontrado.');
    }
    this.preventManagerAdminChange(actorRole, user.role?.name ?? null);

    await this.guardLastAdminRule(user.id, user.companyId, user.role?.name ?? null, null, false);
    await user.destroy();
  }

  async updateUserSecurity(
    userId: string,
    payload: UpdateUserSecurityPayload,
    companyId: string,
    actorRole: string = UserRole.ADMIN,
  ): Promise<void> {
    const user = await this.userRepository.findById(userId, companyId);
    if (!user) {
      throw new HttpError(404, 'Usuario no encontrado.');
    }

    const role = await Role.findByPk(payload.roleId);
    if (!role || !this.canAssignRoleToCompany(role, companyId, actorRole, user.roleId)) {
      throw new HttpError(400, 'Rol invalido.');
    }
    this.preventManagerAdminChange(actorRole, user.role?.name ?? null);

    await this.guardLastAdminRule(user.id, user.companyId, user.role?.name ?? null, role.name, payload.isActive);
    await this.userRepository.updateSecurityProfile(user.id, role.id, payload.isActive, companyId);
  }

  async createRole(payload: CreateRolePayload, companyId: string): Promise<void> {
    const roleName = payload.name.trim().toUpperCase();
    this.validateCustomRoleName(roleName);

    const existing = await Role.findOne({ where: { name: roleName, companyId } });
    if (existing) {
      throw new HttpError(400, 'El rol ya existe.');
    }

    await Role.create({
      companyId,
      name: roleName,
      description: payload.description?.trim() || null,
    });
  }

  async updateRole(roleId: string, payload: UpdateRolePayload, companyId: string): Promise<void> {
    const role = await Role.findOne({ where: { id: roleId, companyId } });
    if (!role) {
      throw new HttpError(404, 'Rol no encontrado.');
    }
    const roleName = payload.name.trim().toUpperCase();
    this.validateCustomRoleName(roleName);
    const duplicate = await Role.findOne({
      where: {
        name: roleName,
        companyId,
        id: { [Op.ne]: role.id },
      },
    });

    if (duplicate) {
      throw new HttpError(400, 'Ya existe otro rol con ese nombre.');
    }

    role.name = roleName;
    role.description = payload.description?.trim() || null;
    await role.save();
  }

  async deleteRole(roleId: string, companyId: string): Promise<void> {
    await sequelize.transaction(async (transaction) => {
      const role = await Role.findOne({
        where: { id: roleId, companyId }, transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!role) {
        throw new HttpError(404, 'Rol no encontrado.');
      }
      if (await User.count({ where: { roleId: role.id }, paranoid: false, transaction })) {
        throw new HttpError(400, 'No se puede eliminar un rol con usuarios asociados.');
      }

      await RolePermission.destroy({ where: { roleId: role.id }, transaction });
      await role.destroy({ transaction });
    });
  }

  async updateRolePermissions(roleId: string, payload: UpdateRolePermissionsPayload, companyId: string): Promise<void> {
    // Reemplaza en bloque los permisos del rol, validando que todos pertenezcan al catalogo permitido.
    const role = await Role.findOne({ where: { id: roleId, companyId } });
    if (!role) {
      throw new HttpError(404, 'Rol no encontrado.');
    }
    const permissions = Array.from(new Set(payload.permissions.map((permission) => permission.trim()).filter(Boolean)));

    for (const permission of permissions) {
      if (!DEFAULT_PERMISSIONS.includes(permission as (typeof DEFAULT_PERMISSIONS)[number])) {
        throw new HttpError(400, `Permiso invalido: ${permission}`);
      }
    }

    await sequelize.transaction(async (transaction) => {
      await RolePermission.destroy({ where: { roleId: role.id }, transaction });
      if (permissions.length > 0) {
        await RolePermission.bulkCreate(
          permissions.map((permission) => {
            const [module, action] = permission.split(':');
            return { roleId: role.id, module, action };
          }),
          { transaction },
        );
      }
    });
  }

  async roleHasPermission(roleId: string, permission: string): Promise<boolean> {
    const role = await Role.findByPk(roleId);
    if (!role) {
      return false;
    }

    if (role.name === UserRole.ADMIN && role.companyId === null) {
      return true;
    }

    const [module, action] = permission.split(':');
    if (!module || !action) {
      return false;
    }

    const count = await RolePermission.count({
      where: {
        roleId: role.id,
        module,
        action,
      },
    });

    return count > 0;
  }

  private async ensureUniqueUserFields(username: string, email: string, excludeUserId?: string): Promise<void> {
    // Impide duplicados de username/email al crear o editar usuarios.
    const normalizedUsername = username.trim();
    const normalizedEmail = email.trim().toLowerCase();

    const conditions = [{ username: normalizedUsername }, { email: normalizedEmail }];

    const where = excludeUserId
      ? {
          [Op.and]: [{ id: { [Op.ne]: excludeUserId } }, { [Op.or]: conditions }],
        }
      : {
          [Op.or]: conditions,
        };

    const existing = await User.findOne({ where, paranoid: false });
    if (!existing) {
      return;
    }

    if (existing.username === normalizedUsername) {
      throw new HttpError(400, 'El nombre de usuario ya esta en uso.');
    }

    throw new HttpError(400, 'El email ya esta en uso.');
  }

  private canAssignRoleToCompany(
    role: Role,
    companyId: string,
    actorRole: string,
    currentRoleId?: string,
  ): boolean {
    if (role.companyId === null) {
      return actorRole === UserRole.ADMIN && role.name === UserRole.ADMIN;
    }
    if (role.companyId !== companyId) return false;
    return role.name !== UserRole.ADMIN && (
      actorRole === UserRole.ADMIN ||
      [UserRole.EMPLEADO, UserRole.GERENTE, UserRole.CONTADOR].includes(role.name as UserRole) ||
      role.id === currentRoleId
    );
  }

  private preventManagerAdminChange(actorRole: string, targetRole: string | null): void {
    if (actorRole !== UserRole.ADMIN && targetRole === UserRole.ADMIN) {
      throw new HttpError(403, 'Solo un administrador puede modificar o eliminar usuarios ADMIN.');
    }
  }

  private validateCustomRoleName(roleName: string): void {
    if (roleName === UserRole.ADMIN) {
      throw new HttpError(400, 'El nombre ADMIN está reservado para el administrador.');
    }
  }

  private async guardLastAdminRule(
    userId: string,
    companyId: string | null,
    currentRoleName: string | null,
    nextRoleName: string | null,
    nextIsActive: boolean,
  ): Promise<void> {
    // Regla de seguridad: nunca dejar el sistema sin al menos un ADMIN activo.
    if (currentRoleName !== 'ADMIN') {
      return;
    }

    const adminUsers = await User.findAll({
      where: { companyId },
      include: [{ model: Role, where: { name: 'ADMIN' }, required: true }],
      paranoid: true,
    });

    const activeAdmins = adminUsers.filter((admin) => admin.isActive);
    const isTargetAdmin = adminUsers.some((admin) => admin.id === userId);

    if (!isTargetAdmin) {
      return;
    }

    const adminWillRemainAdmin = nextRoleName === 'ADMIN';
    const adminWillRemainActive = nextIsActive;

    if (activeAdmins.length <= 1 && (!adminWillRemainAdmin || !adminWillRemainActive)) {
      throw new HttpError(400, 'Debe existir al menos un ADMIN activo en la empresa.');
    }
  }
}
