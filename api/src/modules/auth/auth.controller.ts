import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClientIp, CurrentUser, PlatformWritable, Public } from '../../common/decorators';
import type { AuthUser, AuthedRequest } from '../../common/types/auth.types';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, ResolveTenantDto } from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
// Signing in and out is not filing a record.
@PlatformWritable()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('resolve')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Which organisations can this address sign into?',
    description:
      'Email is unique per organisation, not globally. The sign-in screen calls this first and shows a picker when there is more than one.',
  })
  resolve(@Body() dto: ResolveTenantDto) {
    return this.auth.resolveTenants(dto.email);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange credentials for an access and refresh token' })
  login(@Body() dto: LoginDto, @Req() req: AuthedRequest, @ClientIp() ip: string) {
    return this.auth.login(dto.email, dto.password, {
      ip,
      userAgent: req.headers['user-agent'],
      organizationId: dto.organizationId,
    });
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate a refresh token for a new access token' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser) {
    if (user.sessionId) await this.auth.logout(user.sessionId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Current identity, permissions and group closure' })
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
