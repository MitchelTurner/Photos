/**
 * Auth + health HTTP routes.
 *
 *   POST /auth/login    → sets kp_session cookie + returns bearer token
 *   POST /auth/logout   → clears cookie
 *   GET  /auth/me       → current session (401 if missing/expired)
 *   GET  /auth/status   → public diagnostics for the login form (email hint, etc.)
 *   GET  /health        → liveness + media counts (total / published / withBlob)
 *
 * Use /health.media.withBlob when debugging an empty gallery. Zero blobs means
 * re-upload is required; the UI will stay empty until then.
 */
import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { PhotosService } from '../photos/photos.service';
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
  constructor(private readonly photos: PhotosService) {}

  @Get('health')
  async health() {
    let media = null;
    try {
      media = await this.photos.mediaStats();
    } catch {
      media = { error: 'unavailable' };
    }
    return {
      ok: true,
      service: 'ketchikanphotos-api',
      time: new Date().toISOString(),
      media,
    };
  }
}
