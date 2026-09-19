import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

/**
 * Where a request came from, available anywhere beneath it.
 *
 * The audit trail is only evidence if every entry says who acted and from
 * where. Threading the address through each service call meant each new call
 * site had to remember, and most did not: of the first 144 events recorded,
 * only sign-ins and share access carried an origin, because those were the two
 * paths whose authors happened to pass it. Everything else — permission
 * changes, invitations, document views — recorded no address at all.
 *
 * Making it ambient removes the chance to forget. A call site can still pass
 * an explicit address (a share viewer's, say, which is not the caller's) and
 * that always wins.
 */
export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** The active request's context, or null outside a request (jobs, startup). */
export function requestContext(): RequestContext | null {
  return storage.getStore() ?? null;
}

/** Honour the proxy chain: behind a load balancer `req.ip` is the balancer. */
function clientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.ip ?? null;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const ua = req.headers['user-agent'];
    storage.run(
      {
        ip: clientIp(req),
        // Agent strings are attacker-controlled and go into an append-only
        // table, so they are bounded here rather than trusted downstream.
        userAgent: typeof ua === 'string' ? ua.slice(0, 512) : null,
      },
      () => next(),
    );
  }
}
