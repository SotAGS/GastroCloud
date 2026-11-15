export type SubscriptionPlan = 'FREEMIUM' | 'PREMIUM';

export function getEffectiveSubscriptionPlan(
  plan: string | null | undefined,
  status: string | null | undefined,
  premiumExpiresAt: Date | null | undefined,
  now: Date = new Date(),
): SubscriptionPlan {
  if (plan === 'PREMIUM' && status === 'ACTIVE' && (!premiumExpiresAt || premiumExpiresAt.getTime() > now.getTime())) {
    return 'PREMIUM';
  }
  return 'FREEMIUM';
}

const capabilitiesByPlan: Record<SubscriptionPlan, string[]> = {
  FREEMIUM: [
    'dashboard:view',
    'ventas:view',
    'ventas:create',
    'productos:view',
    'stock:view',
    'historial:ventas',
  ],
  PREMIUM: [
    'dashboard:view',
    'ventas:view',
    'ventas:create',
    'compras:view',
    'compras:create',
    'productos:view',
    'stock:view',
    'reportes:view',
    'estadisticas:view',
    'empleados:create',
    'empleados:manage',
    'seguridad:view',
    'seguridad:manage-users',
    'seguridad:manage-roles',
    'seguridad:manage-permissions',
    'historial:ventas',
    'ai:chat',
  ],
};

export function getPlanCapabilities(plan?: string | null): string[] {
  const normalized = (plan ?? 'FREEMIUM').toUpperCase();
  return capabilitiesByPlan[normalized as SubscriptionPlan] ?? capabilitiesByPlan.FREEMIUM;
}

export function canAccessFeature(plan: string | null | undefined, feature: string): boolean {
  return getPlanCapabilities(plan).includes(feature);
}

export function hasCompanyAccess(authUser: { companyId?: string | null } | null | undefined, companyId?: string | null): boolean {
  if (!authUser || !companyId || !authUser.companyId) {
    return false;
  }

  return String(authUser.companyId) === String(companyId);
}

export function hasLocalAccess(
  authUser: { companyId?: string | null; localId?: string | null; role?: string | null } | null | undefined,
  local: { companyId?: string | null; id?: string | null } | null | undefined,
  roleName?: string | null,
): boolean {
  if (!authUser || !local) {
    return false;
  }

  if (!authUser.companyId || String(authUser.companyId) !== String(local.companyId)) {
    return false;
  }

  const resolvedRole = roleName ?? authUser.role ?? 'EMPLEADO';
  if (resolvedRole === 'ADMIN' || resolvedRole === 'GERENTE') {
    return true;
  }

  if (!authUser.localId || !local.id) {
    return false;
  }

  return String(authUser.localId) === String(local.id);
}
