export interface AuthUser {
  id: string;
  roleId: string;
  fullName: string;
  role: string;
  permissions: string[];
  companyId?: string | null;
  localId?: string | null;
  subscriptionPlan?: string | null;
}