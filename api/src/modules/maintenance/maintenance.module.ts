import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { SharesModule } from '../shares/shares.module';
import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [SharesModule, WorkflowModule],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
