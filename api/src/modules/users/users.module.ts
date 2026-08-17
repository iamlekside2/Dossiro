import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  // For EmailService, to deliver invitations. Channels does not depend on
  // Users, so this cannot cycle.
  imports: [ChannelsModule],
  controllers: [UsersController],
  providers: [UsersService],
  // OrganizationsService invites the first administrator when provisioning.
  exports: [UsersService],
})
export class UsersModule {}
