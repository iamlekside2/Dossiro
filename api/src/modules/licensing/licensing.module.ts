import { Module } from '@nestjs/common';
import { PlatformStaffGuard } from '../../common/guards/platform-staff.guard';
import { LicensingController } from './licensing.controller';

@Module({
  controllers: [LicensingController],
  providers: [PlatformStaffGuard],
})
export class LicensingModule {}
