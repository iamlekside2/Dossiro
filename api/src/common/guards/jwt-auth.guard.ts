import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY, OPTIONAL_AUTH_KEY } from '../decorators';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  private flag(key: string, context: ExecutionContext): boolean {
    return Boolean(
      this.reflector.getAllAndOverride<boolean>(key, [context.getHandler(), context.getClass()]),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.flag(IS_PUBLIC_KEY, context)) return true;

    if (this.flag(OPTIONAL_AUTH_KEY, context)) {
      // Populate req.user when a valid token is present, but let anonymous
      // callers through — a following guard decides whether that is acceptable.
      try {
        await super.canActivate(context);
      } catch {
        /* no token, or a bad one: continue as anonymous */
      }
      return true;
    }

    return (await super.canActivate(context)) as boolean;
  }

  handleRequest<TUser>(err: unknown, user: TUser, info: unknown, context: ExecutionContext): TUser {
    if (this.flag(OPTIONAL_AUTH_KEY, context) && !user) {
      return undefined as TUser;
    }
    return super.handleRequest(err, user, info, context) as TUser;
  }
}
