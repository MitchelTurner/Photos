import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { bearerFrom } from '../auth/request-auth';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    try {
      const session = this.auth.authenticateRequest({
        cookieToken: req.cookies?.[this.auth.cookieName()],
        bearer: bearerFrom(req),
      });
      (req as Request & { admin?: { email: string } }).admin = {
        email: session.email,
      };
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Not signed in');
    }
  }
}
