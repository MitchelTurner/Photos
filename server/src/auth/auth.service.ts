import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcryptjs';

export type SessionPayload = {
  sub: 'admin';
  email: string;
  exp: number;
};

const COOKIE_NAME = 'kp_session';
const SESSION_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

@Injectable()
export class AuthService {
  private readonly loginAttempts = new Map<
    string,
    { count: number; resetAt: number }
  >();

  cookieName(): string {
    return COOKIE_NAME;
  }

  sessionTtlSec(): number {
    return SESSION_TTL_SEC;
  }

  isConfigured(): boolean {
    return Boolean(this.adminEmail() && this.passwordConfigured());
  }

  adminEmail(): string {
    return cleanEnv(process.env.ADMIN_EMAIL).toLowerCase();
  }

  /** Masked hint for the login form, e.g. j***@example.com */
  emailHint(): string | null {
    const email = this.adminEmail();
    if (!email || !email.includes('@')) return null;
    const [user, domain] = email.split('@');
    if (!user) return null;
    const keep = user.slice(0, 1);
    return `${keep}***@${domain}`;
  }

  authDiagnostics() {
    return {
      loginConfigured: this.isConfigured() || Boolean(cleanEnv(process.env.ADMIN_TOKEN)),
      emailRequired: Boolean(this.adminEmail()),
      emailHint: this.emailHint(),
      passwordSource: process.env.ADMIN_PASSWORD_HASH?.trim()
        ? 'ADMIN_PASSWORD_HASH'
        : cleanEnv(process.env.ADMIN_PASSWORD)
          ? 'ADMIN_PASSWORD'
          : cleanEnv(process.env.ADMIN_TOKEN)
            ? 'ADMIN_TOKEN'
            : 'none',
    };
  }

  /** Login with email + password. Supports bcrypt hash or plaintext ADMIN_PASSWORD.
   *  Legacy: ADMIN_TOKEN alone still works as the password (any matching email). */
  async login(email: string, password: string, ip: string) {
    this.assertRateLimit(ip);

    if (!this.isConfigured() && !cleanEnv(process.env.ADMIN_TOKEN)) {
      throw new UnauthorizedException(
        'Admin login is not configured. Set ADMIN_EMAIL + ADMIN_PASSWORD (or ADMIN_TOKEN).',
      );
    }

    const okEmail = this.emailsMatch(email, this.adminEmail() || email);
    const okPass = await this.passwordMatches(password);

    if (!okEmail || !okPass) {
      this.recordFailure(ip);
      throw new UnauthorizedException('Invalid email or password');
    }

    this.loginAttempts.delete(ip);
    const sessionEmail = this.adminEmail() || email.trim().toLowerCase();
    const token = this.issueToken(sessionEmail);
    return {
      token,
      email: sessionEmail,
      expiresAt: new Date(Date.now() + SESSION_TTL_SEC * 1000).toISOString(),
    };
  }

  verifyToken(token: string | undefined | null): SessionPayload {
    if (!token) {
      throw new UnauthorizedException('Not signed in');
    }
    const parts = token.split('.');
    if (parts.length !== 2) {
      throw new UnauthorizedException('Invalid session');
    }
    const [body, sig] = parts;
    const expected = this.sign(body);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid session');
    }
    let payload: SessionPayload;
    try {
      payload = JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8'),
      ) as SessionPayload;
    } catch {
      throw new UnauthorizedException('Invalid session');
    }
    if (payload.sub !== 'admin' || !payload.email || !payload.exp) {
      throw new UnauthorizedException('Invalid session');
    }
    if (Date.now() > payload.exp * 1000) {
      throw new UnauthorizedException('Session expired — sign in again');
    }
    return payload;
  }

  /** Accept session cookie, Bearer session token, or legacy raw ADMIN_TOKEN. */
  authenticateRequest(opts: {
    cookieToken?: string;
    bearer?: string;
  }): SessionPayload {
    const bearer = opts.bearer?.trim();
    const cookie = opts.cookieToken?.trim();

    if (bearer) {
      // Prefer signed session; fall back to legacy static ADMIN_TOKEN for API tools.
      try {
        return this.verifyToken(bearer);
      } catch {
        if (this.legacyTokenMatches(bearer)) {
          return {
            sub: 'admin',
            email: this.adminEmail() || 'admin',
            exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
          };
        }
        throw new UnauthorizedException('Invalid session');
      }
    }

    if (cookie) {
      return this.verifyToken(cookie);
    }

    throw new UnauthorizedException('Not signed in');
  }

  cookieOptions(maxAgeSec = SESSION_TTL_SEC) {
    const secure =
      process.env.COOKIE_SECURE === 'true' ||
      (process.env.PUBLIC_API_URL || '').startsWith('https://');
    const sameSite =
      (process.env.COOKIE_SAMESITE as 'lax' | 'none' | 'strict' | undefined) ||
      (secure ? 'none' : 'lax');

    return {
      httpOnly: true,
      secure: sameSite === 'none' ? true : secure,
      sameSite,
      maxAge: maxAgeSec * 1000,
      path: '/',
    } as const;
  }

  private issueToken(email: string): string {
    const payload: SessionPayload = {
      sub: 'admin',
      email,
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.sign(body)}`;
  }

  private sign(body: string): string {
    return createHmac('sha256', this.sessionSecret())
      .update(body)
      .digest('base64url');
  }

  private sessionSecret(): string {
    const explicit = cleanEnv(process.env.ADMIN_SESSION_SECRET);
    if (explicit) return explicit;
    // Derive a stable secret from configured credentials so sessions survive restarts
    // even if ADMIN_SESSION_SECRET isn't set (still set it in production).
    const material =
      cleanEnv(process.env.ADMIN_PASSWORD) ||
      cleanEnv(process.env.ADMIN_PASSWORD_HASH) ||
      cleanEnv(process.env.ADMIN_TOKEN) ||
      randomBytes(32).toString('hex');
    return createHmac('sha256', 'ketchikanphotos-admin')
      .update(material)
      .digest('hex');
  }

  private passwordConfigured(): boolean {
    return Boolean(
      cleanEnv(process.env.ADMIN_PASSWORD) ||
        cleanEnv(process.env.ADMIN_PASSWORD_HASH) ||
        cleanEnv(process.env.ADMIN_TOKEN),
    );
  }

  private async passwordMatches(password: string): Promise<boolean> {
    const input = password.normalize('NFC');
    const hash = cleanEnv(process.env.ADMIN_PASSWORD_HASH);
    if (hash) {
      try {
        return await bcrypt.compare(input, hash);
      } catch {
        return false;
      }
    }
    const plain = cleanEnv(process.env.ADMIN_PASSWORD);
    if (plain) {
      return safeEqual(input, plain.normalize('NFC'));
    }
    // Legacy single shared secret
    const token = cleanEnv(process.env.ADMIN_TOKEN);
    if (token) {
      return safeEqual(input, token.normalize('NFC'));
    }
    return false;
  }

  private legacyTokenMatches(token: string): boolean {
    const expected = cleanEnv(process.env.ADMIN_TOKEN);
    if (!expected) return false;
    return safeEqual(token, expected);
  }

  private emailsMatch(input: string, expected: string): boolean {
    if (!expected) return true; // token-only legacy mode
    return safeEqual(input.trim().toLowerCase(), expected);
  }

  private assertRateLimit(ip: string) {
    const now = Date.now();
    const row = this.loginAttempts.get(ip);
    if (!row || now > row.resetAt) return;
    if (row.count >= 8) {
      throw new HttpException(
        'Too many login attempts — try again in a few minutes',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordFailure(ip: string) {
    const now = Date.now();
    const row = this.loginAttempts.get(ip);
    if (!row || now > row.resetAt) {
      this.loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
      return;
    }
    row.count += 1;
  }
}

/** Trim whitespace/newlines and strip wrapping quotes from Railway env values. */
function cleanEnv(value: string | undefined): string {
  let v = (value ?? '').trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    // Still do a compare to reduce trivial timing leaks on length
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}
