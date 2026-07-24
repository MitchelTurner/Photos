import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './login.dto';
import { bearerFrom } from './request-auth';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown';

    const session = await this.auth.login(dto.email, dto.password, ip);
    res.cookie(
      this.auth.cookieName(),
      session.token,
      this.auth.cookieOptions(),
    );
    return {
      ok: true,
      email: session.email,
      expiresAt: session.expiresAt,
      // Returned for cross-origin admin hosts that can't store the cookie.
      token: session.token,
    };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(this.auth.cookieName(), this.auth.cookieOptions(0));
    return { ok: true };
  }

  @Get('me')
  me(@Req() req: Request) {
    const payload = this.auth.authenticateRequest({
      cookieToken: req.cookies?.[this.auth.cookieName()],
      bearer: bearerFrom(req),
    });
    return {
      ok: true,
      email: payload.email,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    };
  }

  @Get('status')
  status() {
    return {
      ok: true,
      ...this.auth.authDiagnostics(),
    };
  }
}

@Controller()
export class HealthController {
  @Get('health')
  health() {
    return {
      ok: true,
      service: 'ketchikanphotos-api',
      time: new Date().toISOString(),
    };
  }
}
