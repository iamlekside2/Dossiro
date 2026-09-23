import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { SearchModule } from '../search/search.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { FormsController } from './forms.controller';
import { FormsService } from './forms.service';

@Module({
  imports: [DocumentsModule, SearchModule, WorkflowModule],
  controllers: [FormsController],
  providers: [FormsService],
  exports: [FormsService],
})
export class FormsModule {}
