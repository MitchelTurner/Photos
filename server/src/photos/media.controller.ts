/**
 * =============================================================================
 * GET /media/:filename
 * =============================================================================
 *
 * How gallery images are loaded in the browser:
 *   GET /photos  →  { src: "https://…/media/1784….jpg", … }
 *   <img src>    →  this controller (or express static under the same prefix)
 *
 * Lookup order:
 *   1. File on disk at UPLOAD_DIR/:filename  (fast path / cache)
 *   2. Photo row by unique filename + PhotoBlob.data  (durable source of truth)
 *   3. 404 — tell the operator to re-upload in /admin
 *
 * When serving from the DB we also try to rewrite the file onto disk so later
 * requests and Prodigi fetches hit the cache. That write is best-effort.
 *
 * Security: filename is restricted to [a-zA-Z0-9._-] to block path traversal.
 * =============================================================================
 */
import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { uploadDir } from './upload.config';

@Controller('media')
export class MediaController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':filename')
  async file(@Param('filename') filename: string, @Res() res: Response) {
    // Prevent path traversal (e.g. ../../etc/passwd)
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '');
    if (!safe || safe !== filename) {
      throw new NotFoundException('Invalid media filename');
    }

    const full = join(uploadDir(), safe);
    if (existsSync(full)) {
      return res.sendFile(full);
    }

    // Fall back to Postgres blob (survives Railway redeploys without a volume)
    const photo = await this.prisma.photo.findUnique({
      where: { filename: safe },
      include: { blob: true },
    });
    if (!photo?.blob) {
      throw new NotFoundException(
        `Media file missing (${safe}). Re-upload the photo in /admin — new uploads are stored in the database.`,
      );
    }

    const buf = Buffer.from(photo.blob.data);
    try {
      writeFileSync(full, buf);
    } catch {
      // Disk may be read-only / full — still serve from memory
    }

    res.setHeader('Content-Type', photo.blob.mimeType || photo.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Length', String(buf.length));
    return res.send(buf);
  }
}
