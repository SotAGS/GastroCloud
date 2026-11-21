export interface AuthUser {
  id: string;
  roleId: string;
  fullName: string;
  role: string;
  permissions: string[];
  companyWideAccess?: boolean;
  companyId?: string | null;
  localId?: string | null;
  subscriptionPlan?: string | null;
}