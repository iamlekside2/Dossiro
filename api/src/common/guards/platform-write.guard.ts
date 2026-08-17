import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PLATFORM_WRITABLE_KEY } from '../decorators';
import type { AuthedRequest } from '../types/auth.types';

/** Methods that only read. A platform operator's reads are already empty. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Keeps the platform organisation out of the records business.
 *
 * The platform realm administers tenants; it is not itself a filing system.
 * Reads need no guarding — every query is scoped by the caller's own
 * organizationId and the platform organisation holds nothing, so its lists come
 * back empty. Writes are the danger: without this, an operator could file
 * branches, folders, grants and shares into the realm that is supposed to hold
 * none of them, and the "we cannot see your records" promise would erode one
 * accidental POST at a time.
 *
 * Deliberately **fail-closed**: every write is refused unless its controller or
 * handler is marked `@PlatformWritable()`. A new records module added next year
 * is covered the day it is written, with no one having to remember this file.
 * The cost is that a genuinely new *administration* surface must opt in — a
 * 403 during development, which is the failure worth having.
 */
@Injectable()
export class PlatformWriteGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();

    // Anonymous callers and ordinary tenants are not this guard's business.
    if (!req.user?.isPlatform) return true;
    if (READ_METHODS.has(req.method)) return true;

    const allowed = this.reflector.getAllAndOverride<boolean>(PLATFORM_WRITABLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed) return true;

    throw new ForbiddenException(
      'The platform organisation administers tenants and holds no records of its own. Sign in to a customer organisation to do this.',
    );
  }
}
