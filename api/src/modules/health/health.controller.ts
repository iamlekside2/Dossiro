import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AppConfig } from '../../common/config/configuration';
import { Public } from '../../common/decorators';
import { DatabaseService } from '../../common/db';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<{ app: AppConfig }, true>,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness and dependency status' })
  async check() {
    const app = this.config.get('app', { infer: true });

    let database: 'up' | 'down' = 'down';
    try {
      await this.db.query('SELECT 1');
      database = 'up';
    } catch {
      database = 'down';
    }

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      service: 'arkin-api',
      env: app.env,
      timestamp: new Date().toISOString(),
      dependencies: {
        database,
        storage: app.storage.driver,
        queue: app.redisUrl ? 'redis' : 'in-process',
        whatsapp: app.whatsapp.enabled ? 'enabled' : 'disabled',
        email: app.email.enabled ? 'enabled' : 'disabled',
        ai: app.ai.provider,
      },
    };
  }
}
