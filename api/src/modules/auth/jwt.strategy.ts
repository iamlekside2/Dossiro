import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AppConfig } from '../../common/config/configuration';
import type { AuthUser, JwtPayload } from '../../common/types/auth.types';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<{ app: AppConfig }, true>,
    private readonly auth: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('app', { infer: true }).jwt.secret,
    });
  }

  /**
   * Rebuilds the identity from the database on every request rather than
   * trusting claims baked into the token. It costs a query, but it means a
   * revoked session or a downgraded role takes effect immediately instead of
   * waiting out the token's lifetime.
   */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    return this.auth.validateSession(payload);
  }
}
