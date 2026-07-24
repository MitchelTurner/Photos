import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import { uploadDir } from './upload.config';

@Controller('media')
export class MediaController {
  @Get(':filename')
  file(@Param('filename') filename: string, @Res() res: Response) {
    // Prevent path traversal
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '');
    if (!safe || safe !== filename) {
      throw new NotFoundException('Invalid media filename');
    }
    const full = join(uploadDir(), safe);
    if (!existsSync(full)) {
      throw new NotFoundException(
        `Media file missing on disk (${safe}). Mount a Railway volume at UPLOAD_DIR and re-upload the photo.`,
      );
    }
    return res.sendFile(full);
  }
}
