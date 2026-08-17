import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DocumentsModule } from '../documents/documents.module';
import { SearchModule } from '../search/search.module';
import { SharesModule } from '../shares/shares.module';
import { ChannelsController } from './channels.controller';
import { EmailService } from './email.service';
import { WhatsAppService } from './whatsapp.service';

@Module({
  imports: [DocumentsModule, SharesModule, SearchModule, AuthModule],
  controllers: [ChannelsController],
  providers: [WhatsAppService, EmailService],
  exports: [WhatsAppService, EmailService],
})
export class ChannelsModule {}
