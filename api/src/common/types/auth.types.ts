import { UserTier } from '../db';
import type { Request } from 'express';
import type { Permission } from '../rbac/permissions';

/** Shape attached to `req.user` after JwtAuthGuard runs. */
export interface AuthUser {
  id: string;
  organizationId: string;
  email: string;
  displayName: string;
  tier: UserTier;
  /** True when this session belongs to the platform organisation, not a
   *  customer tenant. Such a session operates tenants and holds no documents. */
  isPlatform: boolean;
  organizationName: string;
  permissions: Permission[];
  /** Ids of every group the user belongs to, including ancestor departments. */
  groupIds: string[];
  roleIds: string[];
  /** The branch this person is posted to, plus every branch above it. */
  branchIds: string[];
  /** Their own posting, for display. Null when unposted. */
  branchId: string | null;
  sessionId?: string;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
  /** Raw body, captured for webhook signature verification. */
  rawBody?: Buffer;
}

export interface JwtPayload {
  sub: string;
  org: string;
  sid: string;
  tier: UserTier;
}
