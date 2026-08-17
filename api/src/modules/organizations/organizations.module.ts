import { Module } from '@nestjs/common';
import { PlatformStaffGuard } from '../../common/guards/platform-staff.guard';
import { UsersModule } from '../users/users.module';
import { OrganizationsController } from './organizations.controller';
import { HostnamesService } from './hostnames.service';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [UsersModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, HostnamesService, PlatformStaffGuard],
  exports: [OrganizationsService, HostnamesService],
})
export class OrganizationsModule {}
