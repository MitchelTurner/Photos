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
    // Prevent path traversal
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
