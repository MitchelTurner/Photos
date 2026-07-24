import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.ADMIN_TOKEN;
    if (!expected) {
      throw new UnauthorizedException(
        'ADMIN_TOKEN is not configured on the server',
      );
    }

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ')
      ? header.slice(7).trim()
      : '';
    const alt = (req.headers['x-admin-token'] as string | undefined) || '';
    const token = bearer || alt;

    if (!token || token !== expected) {
      throw new UnauthorizedException('Invalid admin token');
    }
    return true;
  }
}
