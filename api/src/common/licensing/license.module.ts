import { Global, Module } from '@nestjs/common';
import { LicenseService } from './license.service';

/** Global: seat and write checks live wherever records or people are created. */
@Global()
@Module({
  providers: [LicenseService],
  exports: [LicenseService],
})
export class LicenseModule {}
