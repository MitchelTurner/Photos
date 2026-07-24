import { Request } from 'express';

export function bearerFrom(req: Request): string | undefined {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  const alt = req.headers['x-admin-token'];
  return typeof alt === 'string' ? alt : undefined;
}
