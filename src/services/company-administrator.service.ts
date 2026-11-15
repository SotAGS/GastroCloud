import { AuthUser } from '../interfaces/auth-user.interface';
import { UserRole } from '../enums/user-role.enum';
import { Company, Role, User } from '../models';
import { HttpError } from '../utils/http-error.util';

export async function requireCompanyAdministrator(user: AuthUser | null | undefined): Promise<User> {
  if (!user?.id || !user.companyId) {
    throw new HttpError(403, 'La cuenta no está autorizada para administrar esta empresa.');
  }
  const actor = await User.findOne({
    where: { id: user.id, companyId: user.companyId, isActive: true },
    include: [
      { model: Role, where: { name: UserRole.ADMIN, companyId: null }, required: true },
      { model: Company, where: { isActive: true, isSupportOperator: false }, required: true },
    ],
  });
  if (!actor) {
    throw new HttpError(403, 'La cuenta no está autorizada para administrar esta empresa.');
  }
  return actor;
}
