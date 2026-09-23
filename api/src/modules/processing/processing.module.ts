import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { StorageModule } from '../storage/storage.module';
import { ProcessingController } from './processing.controller';
import { ProcessingService } from './processing.service';

@Module({
  imports: [SearchModule, StorageModule],
  controllers: [ProcessingController],
  providers: [ProcessingService],
  exports: [ProcessingService],
})
export class ProcessingModule {}
