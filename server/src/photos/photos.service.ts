/**
 * =============================================================================
 * PhotosService — gallery catalog + durable image storage
 * =============================================================================
 *
 * DATA MODEL
 *   Photo       metadata shown in the gallery (title, category, tones, …)
 *   PhotoBlob   raw image bytes (BYTEA). Required for a photo to appear in
 *               GET /photos. Survives Railway redeploys without a disk volume.
 *
 * PUBLIC SHAPE (PhotoPublic)
 *   Matches what index.html expects: { id, cat, title, coord, cond, when, h,
 *   tone:[a,b], src, forSale }. `src` is an absolute URL built from
 *   PUBLIC_API_URL + /media/{filename}.
 *
 * EMPTY GALLERY CHECKLIST
 *   1. GET /health → media.withBlob  (must be > 0)
 *   2. GET /photos → non-empty array
 *   3. GET /media/<filename> → 200 image/*
 *   If withBlob is 0: delete orphan rows in /admin and re-upload.
 *
 * CHECKOUT / PRODIGI
 *   assertForSale + resolvePrintUrl ensure a paid print has a reachable asset
 *   URL. Prodigi downloads that URL after Stripe marks the order paid.
 * =============================================================================
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Photo } from '@prisma/client';
import { existsSync } from 'fs';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { mediaUrl, uploadDir } from './upload.config';

/** Duotone placeholder colors used under real photos while they fade in. */
const TONES: [string, string][] = [
  ['#12333a', '#2a5a55'],
  ['#1c2e33', '#7d5a3c'],
  ['#2a1512', '#b04a30'],
  ['#101f28', '#39777f'],
  ['#182b2c', '#8a9a8f'],
  ['#241a12', '#c9743f'],
  ['#1d2733', '#6f88a0'],
  ['#22160f', '#8a5a34'],
];

export type PhotoPublic = {
  id: number;
  cat: string;
  title: string;
  coord: string;
  cond: string;
  when: string;
  h: number;
  tone: [string, string];
  src: string;
  forSale: boolean;
  description: string;
  alt: string;
  seoTitle: string;
  seoDescription: string;
  keywords: string;
};

@Injectable()
export class PhotosService {
  constructor(private readonly prisma: PrismaService) {}

  toPublic(photo: Photo): PhotoPublic {
    return {
      id: photo.id,
      cat: photo.category,
      title: photo.title,
      coord: photo.coord,
      cond: photo.cond,
      when: photo.whenShot,
      h: photo.aspectRatio,
      tone: [photo.toneA, photo.toneB],
      src: mediaUrl(photo.filename),
      forSale: photo.forSale,
      description: photo.description || '',
      alt: photo.altText || `${photo.title}, Ketchikan Alaska`,
      seoTitle: photo.seoTitle || '',
      seoDescription: photo.seoDescription || '',
      keywords: photo.keywords || '',
    };
  }

  fileOnDisk(filename: string): boolean {
    return existsSync(join(uploadDir(), filename));
  }

  async mediaStats() {
    const [total, published, withBlob] = await Promise.all([
      this.prisma.photo.count(),
      this.prisma.photo.count({ where: { published: true } }),
      this.prisma.photoBlob.count(),
    ]);
    return {
      total,
      published,
      withBlob,
      uploadDir: uploadDir(),
    };
  }

  /**
   * Public gallery feed. Only published photos that still have image bytes
   * (PhotoBlob) are returned — metadata-only orphans stay hidden.
   */
  async listPublished(): Promise<PhotoPublic[]> {
    const rows = await this.prisma.photo.findMany({
      where: {
        published: true,
        blob: { isNot: null },
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
    });
    return rows.map((p) => this.toPublic(p));
  }

  async listAll(): Promise<PhotoPublic[]> {
    const rows = await this.prisma.photo.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
    });
    return rows.map((p) => this.toPublic(p));
  }

  async listAllAdmin() {
    const rows = await this.prisma.photo.findMany({
      include: { blob: { select: { size: true } } },
      orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
    });
    return rows.map((p) => ({
      ...this.toPublic(p),
      published: p.published,
      filename: p.filename,
      fileMissing: !p.blob,
      blobBytes: p.blob?.size ?? 0,
      aiEnrichedAt: p.aiEnrichedAt,
      createdAt: p.createdAt,
    }));
  }

  async assertForSale(photoId: number): Promise<Photo> {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
      include: { blob: { select: { photoId: true } } },
    });
    if (!photo || !photo.published || !photo.forSale) {
      throw new BadRequestException(
        `Photo ${photoId} is not available for sale`,
      );
    }
    if (!photo.blob && !this.fileOnDisk(photo.filename)) {
      throw new BadRequestException(
        `Photo ${photoId} file is missing — re-upload it in /admin`,
      );
    }
    return photo;
  }

  async resolvePrintUrl(photoId: number): Promise<string | null> {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
      include: { blob: { select: { photoId: true } } },
    });
    if (photo && (photo.blob || this.fileOnDisk(photo.filename))) {
      return mediaUrl(photo.filename);
    }

    const base = process.env.PRINT_ASSET_BASE_URL?.replace(/\/$/, '');
    if (base) return `${base}/${photoId}.jpg`;

    return process.env.PRODIGI_FALLBACK_ASSET_URL || null;
  }

  /**
   * Single upload. Multer has already written `file` to UPLOAD_DIR; we also
   * persist bytes into PhotoBlob in the same create() so the gallery survives
   * the next deploy. Title falls back to a cleaned filename when omitted
   * (important for bulk uploads).
   */
  async createFromUpload(
    file: Express.Multer.File | undefined,
    body: {
      title?: string;
      category?: string;
      coord?: string;
      cond?: string;
      whenShot?: string;
      aspectRatio?: string | number;
      forSale?: string | boolean;
      published?: string | boolean;
    },
  ) {
    if (!file) throw new BadRequestException('Image file is required');
    const title =
      (body.title || '').trim() || titleFromFilename(file.originalname);
    const category = (body.category || '').trim();
    if (!title) throw new BadRequestException('title is required');
    if (!category) throw new BadRequestException('category is required');

    const tone = TONES[Math.floor(Math.random() * TONES.length)];
    const aspect = Number(body.aspectRatio);
    const forSale = parseBool(body.forSale, true);
    const published = parseBool(body.published, true);

    // Prefer buffer from multer memory; otherwise read the disk file multer wrote
    let data: Buffer;
    if (file.buffer?.length) {
      data = file.buffer;
    } else {
      data = await readFile(join(uploadDir(), file.filename));
    }

    const photo = await this.prisma.photo.create({
      data: {
        title,
        category,
        coord: (body.coord || '').trim(),
        cond: (body.cond || '').trim(),
        whenShot: (body.whenShot || '').trim(),
        aspectRatio: Number.isFinite(aspect) && aspect > 0 ? aspect : 1.25,
        toneA: tone[0],
        toneB: tone[1],
        filename: file.filename,
        mimeType: file.mimetype,
        forSale,
        published,
        blob: {
          create: {
            data: new Uint8Array(data),
            mimeType: file.mimetype,
            size: data.length,
          },
        },
      },
    });

    return {
      ...this.toPublic(photo),
      published: photo.published,
    };
  }

  /** Bulk upload — same metadata applied to every file; titles from each filename. */
  async createManyFromUpload(
    files: Express.Multer.File[] | undefined,
    body: {
      category?: string;
      coord?: string;
      cond?: string;
      whenShot?: string;
      aspectRatio?: string | number;
      forSale?: string | boolean;
      published?: string | boolean;
    },
  ) {
    if (!files?.length) {
      throw new BadRequestException('At least one image file is required');
    }
    if (files.length > 40) {
      throw new BadRequestException('Maximum 40 files per bulk upload');
    }
    const created = [];
    const errors: { file: string; error: string }[] = [];
    for (const file of files) {
      try {
        created.push(
          await this.createFromUpload(file, {
            ...body,
            title: titleFromFilename(file.originalname),
          }),
        );
      } catch (err) {
        errors.push({
          file: file.originalname || file.filename,
          error: err instanceof Error ? err.message : 'Upload failed',
        });
      }
    }
    return {
      uploaded: created.length,
      failed: errors.length,
      photos: created,
      errors,
    };
  }

  async update(
    id: number,
    body: {
      title?: string;
      category?: string;
      coord?: string;
      cond?: string;
      whenShot?: string;
      aspectRatio?: number;
      forSale?: boolean;
      published?: boolean;
      sortOrder?: number;
      description?: string;
      altText?: string;
      seoTitle?: string;
      seoDescription?: string;
      keywords?: string;
      legacySlug?: string;
    },
  ) {
    await this.require(id);
    const photo = await this.prisma.photo.update({
      where: { id },
      data: {
        title: body.title?.trim(),
        category: body.category?.trim(),
        coord: body.coord?.trim(),
        cond: body.cond?.trim(),
        whenShot: body.whenShot?.trim(),
        aspectRatio: body.aspectRatio,
        forSale: body.forSale,
        published: body.published,
        sortOrder: body.sortOrder,
        description: body.description?.trim(),
        altText: body.altText?.trim(),
        seoTitle: body.seoTitle?.trim(),
        seoDescription: body.seoDescription?.trim(),
        keywords: body.keywords?.trim(),
        legacySlug:
          body.legacySlug === undefined
            ? undefined
            : body.legacySlug.trim()
              ? body.legacySlug.trim().toLowerCase()
              : null,
      },
    });
    return {
      ...this.toPublic(photo),
      published: photo.published,
    };
  }

  async remove(id: number) {
    const photo = await this.require(id);
    await this.prisma.photo.delete({ where: { id } });
    try {
      await unlink(join(uploadDir(), photo.filename));
    } catch {
      // file may already be gone
    }
    return { deleted: true, id };
  }

  private async require(id: number): Promise<Photo> {
    const photo = await this.prisma.photo.findUnique({ where: { id } });
    if (!photo) throw new NotFoundException(`Photo ${id} not found`);
    return photo;
  }
}

function parseBool(v: string | boolean | undefined, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1' || v === 'on' || v === 'yes';
}

function titleFromFilename(name: string | undefined): string {
  if (!name) return '';
  const base = name.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  const cleaned = base
    .replace(/[_+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}
