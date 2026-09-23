import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { DocumentTypesController } from './document-types.controller';
import { DocumentTypesService } from './document-types.service';

@Module({
  imports: [WorkflowModule],
  controllers: [DocumentTypesController],
  providers: [DocumentTypesService],
  exports: [DocumentTypesService],
})
export class DocumentTypesModule {}
