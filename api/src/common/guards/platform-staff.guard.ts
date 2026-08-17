import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { AppConfig } from '../config/configuration';
import { DatabaseService } from '../db';
import type { AuthedRequest } from '../types/auth.types';

/**
 * Guards tenant lifecycle: creating, suspending and closing organisations.
 *
 * Authority comes from **membership of the platform organisation**, not from a
 * flag on a user inside a customer tenant. That separation is the point:
 * operating the platform and using the product are different jobs, and the
 * first must not depend on belonging to any customer's organisation.
 *
 * Two ways through:
 *
 *  1. A signed-in user whose organisation has `isPlatform`.
 *  2. The `x-platform-key` header matching PLATFORM_ADMIN_KEY — the bootstrap
 *     route, because the platform organisation itself has to be created before
 *     anyone exists to create it. Retire the key once operators have accounts.
 *
 * Neither grants access to any customer's documents. Every document query is
 * scoped by the caller's own organizationId, and the platform organisation
 * holds none — a database trigger refuses to file one there.
 */
@Injectable()
export class PlatformStaffGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService<{ app: AppConfig }, true>,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();

    const configured = this.config.get('app', { infer: true }).platformAdminKey;
    const presented = req.headers['x-platform-key'];

    if (configured && typeof presented === 'string') {
      const a = Buffer.from(presented);
      const b = Buffer.from(configured);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    }

    if (req.user) {
      const org = await this.db.maybeOne<{ id: string }>(
        'SELECT id FROM organizations WHERE id = $1 AND "isPlatform" = true',
        [req.user.organizationId],
      );
      if (org) return true;
    }

    throw new ForbiddenException(
      'Tenant administration is restricted to the platform organisation.',
    );
  }
}
