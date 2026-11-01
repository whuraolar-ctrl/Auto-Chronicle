import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { ProfileModule } from './profiles/profile.module';
import { IssuesModule } from './issues/issues.module';
import { RepairsModule } from './repairs/repairs.module';
import { ExpensesModule } from './expenses/expenses.module';
import { HealthController } from './health/health.controller';
import { VehiclesModule } from './vehicles/vehicles.module';
import { DriverReportsModule } from './driver-reports/driver-reports.module';
import { FleetModule } from './fleet/fleet.module';
import { CarFundModule } from './car-fund/car-fund.module';
import { EmailRemindersModule } from './email-reminders/email-reminders.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    //60 requests per minute per IP address
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 60,
      },
    ]),
    SupabaseModule,
    AuthModule,
    ProfileModule,
    IssuesModule,
    RepairsModule,
    ExpensesModule,
    VehiclesModule,
    DriverReportsModule,
    FleetModule,
    CarFundModule,
    EmailRemindersModule,
    NotificationsModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
