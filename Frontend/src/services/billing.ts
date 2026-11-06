import { api } from './api';

export type Entitlements = {
  plan: string;
  planName: string;
  status: 'free' | 'active' | 'expired';
  maxVehicles: number;
  canUseFleet: boolean;
  canInviteDrivers: boolean;
  canExport: boolean;
  isPaid: boolean;
};

export type CheckoutRequest = {
  plan: 'premium' | 'fleet';
  interval: 'monthly' | 'yearly';
  currency: 'NGN' | 'USD';
  quantity?: number;
};

export type CheckoutResponse = {
  reference: string;
  accessCode: string;
  authorizationUrl: string;
  amount: number;
  currency: string;
};

export async function fetchEntitlements(): Promise<Entitlements> {
  const { data } = await api.get<Entitlements>('/billing/entitlements');
  return data;
}

export function isUpgradeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const ax = error as {
    response?: { status?: number; data?: { code?: string } };
  };
  const status = ax.response?.status;
  const code = ax.response?.data?.code;
  return (
    status === 402 ||
    status === 403 ||
    code === 'VEHICLE_LIMIT_REACHED' ||
    code === 'PLAN_UPGRADE_REQUIRED'
  );
}

export function upgradeMessage(error: unknown): string {
  const ax = error as {
    response?: { data?: { message?: string } };
  };
  return (
    ax.response?.data?.message ||
    'This feature requires a paid plan. Upgrade to continue.'
  );
}

export async function startCheckout(
  body: CheckoutRequest,
): Promise<CheckoutResponse> {
  const { data } = await api.post<CheckoutResponse>('/billing/checkout', body);
  return data;
}
