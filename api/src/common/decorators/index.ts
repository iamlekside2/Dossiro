import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AccessLevel } from '../db';
import type { Permission } from '../rbac/permissions';
import type { AuthedRequest, AuthUser } from '../types/auth.types';

export const IS_PUBLIC_KEY = 'cv:isPublic';
export const OPTIONAL_AUTH_KEY = 'cv:optionalAuth';
export const PERMISSIONS_KEY = 'cv:permissions';
export const RESOURCE_ACCESS_KEY = 'cv:resourceAccess';
export const PLATFORM_WRITABLE_KEY = 'cv:platformWritable';

/** Marks a route as reachable without a JWT (share links, webhooks, health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Authenticate when a token is present, but do not demand one.
 *
 * For routes that accept two kinds of caller — a signed-in operator or a
 * bootstrap key. `@Public()` would be wrong here: it skips the JWT entirely, so
 * a signed-in user arrives anonymous and whatever guard follows cannot see who
 * they are.
 */
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH_KEY, true);

/**
 * Lets the platform organisation write here.
 *
 * PlatformWriteGuard refuses every write from the platform realm by default, so
 * this marks the administration surfaces — tenant lifecycle, licensing, staff,
 * sessions — where an operator legitimately changes something. Never put it on
 * a controller that files records: documents, folders, branches, shares and
 * grants belong to customers, and the platform realm holds none of them.
 */
export const PlatformWritable = () => SetMetadata(PLATFORM_WRITABLE_KEY, true);

/** Requires every listed org-wide permission. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export interface ResourceAccessRule {
  /** Route param holding the resource id, e.g. 'id' for /documents/:id. */
  param: string;
  type: 'DOCUMENT' | 'FOLDER';
  level: AccessLevel;
}

/**
 * Requires a per-object access level on the resource named by a route param.
 * Evaluated by ResourceAccessGuard against the folder-inherited grant tree.
 */
export const RequireAccess = (rule: ResourceAccessRule) => SetMetadata(RESOURCE_ACCESS_KEY, rule);

export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, ctx: ExecutionContext): AuthUser | AuthUser[keyof AuthUser] | undefined => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user) return undefined;
    return field ? req.user[field] : req.user;
  },
);

/** Client IP, honouring the proxy chain when trust proxy is enabled. */
export const ClientIp = createParamDecorator((_data: unknown, ctx: ExecutionContext): string | undefined => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim();
  return req.ip;
});
