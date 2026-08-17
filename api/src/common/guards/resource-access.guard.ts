import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessService } from '../../modules/access/access.service';
import { RESOURCE_ACCESS_KEY, type ResourceAccessRule } from '../decorators';
import type { AuthedRequest } from '../types/auth.types';

/**
 * Enforces per-object access declared with @RequireAccess().
 *
 * Deliberately a guard rather than an in-service check so the requirement is
 * visible on the route signature during review - an access rule you have to
 * go hunting for is an access rule that gets forgotten.
 */
@Injectable()
export class ResourceAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<ResourceAccessRule>(RESOURCE_ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rule) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user;
    if (!user) throw new ForbiddenException('Not authenticated');

    const raw = req.params?.[rule.param];
    const resourceId = Array.isArray(raw) ? raw[0] : raw;
    if (!resourceId) throw new ForbiddenException(`Missing route parameter "${rule.param}"`);

    if (rule.type === 'DOCUMENT') {
      await this.access.assertDocument(user, resourceId, rule.level);
    } else {
      await this.access.assertFolder(user, resourceId, rule.level);
    }
    return true;
  }
}
