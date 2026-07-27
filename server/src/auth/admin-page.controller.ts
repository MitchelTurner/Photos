/**
 * Serves the admin HTML at /admin and /admin/ (not only via static middleware).
 *
 * Prefer opening https://<api-host>/admin/ so API calls are same-origin and
 * cookies work without CORS. The page still lets you override the API base URL
 * for cases where the HTML is hosted elsewhere (e.g. SiteGround).
 */
import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';

function adminIndexPath(): string | null {
  const candidates = [
    join(process.cwd(), 'public', 'admin', 'index.html'),
    join(__dirname, '..', '..', 'public', 'admin', 'index.html'),
    join(process.cwd(), 'admin', 'index.html'),
    join(process.cwd(), '..', 'admin', 'index.html'),
  ];
  return candidates.find((p) => existsSync(p)) || null;
}

/** Explicit routes so /admin and /admin/ always hit the login page. */
@Controller('admin')
export class AdminPageController {
  @Get()
  root(@Res() res: Response) {
    return this.send(res);
  }

  @Get('index.html')
  index(@Res() res: Response) {
    return this.send(res);
  }

  private send(res: Response) {
    const file = adminIndexPath();
    if (!file) {
      return res.status(404).json({
        ok: false,
        message:
          'Admin UI missing from deploy. Ensure server/public/admin/index.html is included.',
      });
    }
    // Always serve the latest admin UI after deploys (browsers / CDNs otherwise keep AI-only HTML).
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    return res.sendFile(file);
  }
}
