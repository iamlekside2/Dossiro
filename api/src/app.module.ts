import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { loadConfiguration } from './common/config/configuration';
import { RequestContextMiddleware } from './common/context/request-context';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PlatformWriteGuard } from './common/guards/platform-write.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { ResourceAccessGuard } from './common/guards/resource-access.guard';
import { DbModule } from './common/db';
import { LicenseModule } from './common/licensing/license.module';
import { AccessModule } from './modules/access/access.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { BranchesModule } from './modules/branches/branches.module';
import { SupportModule } from './modules/support/support.module';
import { DocumentTypesModule } from './modules/document-types/document-types.module';
import { RetentionModule } from './modules/retention/retention.module';
import { FoldersModule } from './modules/folders/folders.module';
import { HealthModule } from './modules/health/health.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { RoadmapModule } from './modules/roadmap/roadmap.module';
import { SearchModule } from './modules/search/search.module';
import { SharesModule } from './modules/shares/shares.module';
import { StorageModule } from './modules/storage/storage.module';
import { SyncModule } from './modules/sync/sync.module';
import { UsersModule } from './modules/users/users.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { LicensingModule } from './modules/licensing/licensing.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [() => ({ app: loadConfiguration() })],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),

    DbModule,

    LicenseModule,
    StorageModule,
    AuditModule,
    AccessModule,

    AuthModule,
    UsersModule,
    OrganizationsModule,
    LicensingModule,
    BranchesModule,
    SupportModule,
    DocumentTypesModule,
    RetentionModule,
    FoldersModule,
    DocumentsModule,
    SharesModule,
    SearchModule,
    ChannelsModule,
    AnalyticsModule,
    SyncModule,
    MaintenanceModule,
    HealthModule,
    RoadmapModule,
  ],
  providers: [
    // Order matters: authenticate, then check org-wide permissions, then
    // per-object access. Registering them globally means a new route is
    // protected by default and has to opt out with @Public() - the safe
    // direction for a system holding HR and health records.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // After the JWT (it needs to know who is calling) and before permissions:
    // whether the platform realm may write here is settled before any
    // per-permission or per-object work is done.
    { provide: APP_GUARD, useClass: PlatformWriteGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ResourceAccessGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Every route, including the public ones: a refused sign-in is exactly the
    // event whose origin an auditor most wants, and it happens before auth.
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
