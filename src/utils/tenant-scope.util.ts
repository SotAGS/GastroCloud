import { AuthUser } from '../interfaces/auth-user.interface';
import { HttpError } from './http-error.util';

export interface TenantScope {
  companyId: string;
  localId: string | null;
}

export function getTenantScope(user?: AuthUser | null): TenantScope {
  if (!user?.companyId) {
    throw new HttpError(403, 'La cuenta no está asociada a una empresa.');
  }

  const companyWideRoles = ['ADMIN', 'GERENTE', 'CONTADOR'];
  if (!companyWideRoles.includes(user.role) && !user.localId) {
    throw new HttpError(403, 'La cuenta no está asociada a una sucursal.');
  }

  return {
    companyId: user.companyId,
    localId: companyWideRoles.includes(user.role) ? null : user.localId!,
  };
}
