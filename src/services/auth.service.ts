import bcrypt from 'bcrypt';
import { LoginDto } from '../interfaces/dto.interface';
import { UserRepository } from '../repositories/user.repository';
import { HttpError } from '../utils/http-error.util';
import { AuthUser } from '../interfaces/auth-user.interface';
import { UserRole } from '../enums/user-role.enum';
import { getEffectiveSubscriptionPlan } from './account-policy.service';

export class AuthService {
  private readonly userRepository = new UserRepository();

  // Ejecuta autenticacion completa: usuario, estado, password y permisos efectivos.
  async login(payload: LoginDto): Promise<AuthUser> {
    const user = await this.userRepository.findByUsernameOrEmail(payload.usernameOrEmail);
    if (!user) {
      throw new HttpError(401, 'Credenciales invalidas');
    }

    if (!user.isActive) {
      throw new HttpError(403, 'El usuario esta inactivo');
    }

    const isValidPassword = await bcrypt.compare(payload.password, user.passwordHash);
    if (!isValidPassword) {
      throw new HttpError(401, 'Credenciales invalidas');
    }

    const companyId = user.companyId ?? user.company?.id ?? null;
    const localId = user.localId ?? user.local?.id ?? null;
    const isBaseRole = user.role?.companyId === null && [UserRole.ADMIN, UserRole.EMPLEADO].includes(user.role.name as UserRole);
    if (!companyId || !localId || !user.company?.isActive || !user.local?.isActive ||
        user.local.companyId !== companyId || !user.role ||
        (!isBaseRole && user.role.companyId !== companyId) ||
        (user.role.name === UserRole.ADMIN && user.role.companyId !== null)) {
      throw new HttpError(403, 'La cuenta no tiene una asignación válida de empresa, sucursal y rol.');
    }

    await this.userRepository.updateLastLogin(user.id);

    const permissions = (user.role?.permissions || []).map(
      (permission) => `${permission.module}:${permission.action}`,
    );

    const plan = getEffectiveSubscriptionPlan(
      user.company.subscriptionPlan,
      user.company.subscriptionStatus,
      user.company.premiumExpiresAt,
    );

    return {
      id: user.id,
      roleId: user.roleId,
      fullName: user.fullName,
      role: user.role?.name ?? 'EMPLEADO',
      permissions,
      companyWideAccess: user.role.companyWideAccess,
      companyId,
      localId,
      subscriptionPlan: plan,
    };
  }
}