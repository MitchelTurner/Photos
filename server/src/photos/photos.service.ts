import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Photo } from '@prisma/client';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { mediaUrl, uploadDir } from './upload.config';

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
    };
  }

  async listPublished(): Promise<PhotoPublic[]> {
    const rows = await this.prisma.photo.findMany({
      where: { published: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
    });
    return rows.map((p) => this.toPublic(p));
  }

  async listAll(): Promise<PhotoPublic[]> {
    const rows = await this.prisma.photo.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
    });
    return rows.map((p) => ({
      ...this.toPublic(p),
      // admin list includes unpublished via same shape; published flag via forSale only —
      // attach via extra fields by casting in controller response
    }));
  }

  async listAllAdmin() {
    const rows = await this.prisma.photo.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
    });
    return rows.map((p) => ({
      ...this.toPublic(p),
      published: p.published,
      filename: p.filename,
      createdAt: p.createdAt,
    }));
  }

  async assertForSale(photoId: number): Promise<Photo> {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
    });
    if (!photo || !photo.published || !photo.forSale) {
      throw new BadRequestException(
        `Photo ${photoId} is not available for sale`,
      );
    }
    return photo;
  }

  async resolvePrintUrl(photoId: number): Promise<string | null> {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
    });
    if (photo) return mediaUrl(photo.filename);

    const base = process.env.PRINT_ASSET_BASE_URL?.replace(/\/$/, '');
    if (base) return `${base}/${photoId}.jpg`;

    return process.env.PRODIGI_FALLBACK_ASSET_URL || null;
  }

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
    const title = (body.title || '').trim();
    const category = (body.category || '').trim();
    if (!title) throw new BadRequestException('title is required');
    if (!category) throw new BadRequestException('category is required');

    const tone = TONES[Math.floor(Math.random() * TONES.length)];
    const aspect = Number(body.aspectRatio);
    const forSale = parseBool(body.forSale, true);
    const published = parseBool(body.published, true);

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
      },
    });

    return {
      ...this.toPublic(photo),
      published: photo.published,
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
