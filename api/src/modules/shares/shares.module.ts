import { Module } from '@nestjs/common';
import { PublicSharesController } from './public-shares.controller';
import { SharesController } from './shares.controller';
import { SharesService } from './shares.service';

@Module({
  controllers: [SharesController, PublicSharesController],
  providers: [SharesService],
  exports: [SharesService],
})
export class SharesModule {}
