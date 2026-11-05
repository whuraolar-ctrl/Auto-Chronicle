import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { User } from '@supabase/supabase-js';
import { BillingService, type Entitlements } from './billing.service';

export type PlanFeature = keyof Pick<
  Entitlements,
  'canUseFleet' | 'canInviteDrivers' | 'canExport'
>;

export const REQUIRE_FEATURE_KEY = 'require_feature';

export const RequireFeature = (feature: PlanFeature) =>
  SetMetadata(REQUIRE_FEATURE_KEY, feature);

@Injectable()
export class PlanGuard implements CanActivate {
  constructor(
    private readonly billing: BillingService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<PlanFeature | undefined>(
      REQUIRE_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!feature) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as User | undefined;
    if (!user?.id) {
      throw new ForbiddenException('Authentication required');
    }

    const entitlements = await this.billing.getEntitlements(user.id);

    if (!entitlements[feature]) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PLAN_UPGRADE_REQUIRED',
        message: `This feature requires a higher plan. Your current plan is ${entitlements.planName}.`,
        plan: entitlements.plan,
        feature,
      });
    }

    request.entitlements = entitlements;
    return true;
  }
}
