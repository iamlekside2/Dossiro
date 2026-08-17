import { Global, Module } from '@nestjs/common';
import { AccessController } from './access.controller';
import { AccessService } from './access.service';

/** Global: guards and services across the app resolve object access. */
@Global()
@Module({
  controllers: [AccessController],
  providers: [AccessService],
  exports: [AccessService],
})
export class AccessModule {}
