import { Module } from '@nestjs/common';
import { SharesModule } from '../shares/shares.module';
import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [SharesModule],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
