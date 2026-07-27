/**
 * =============================================================================
 * Claude Vision → photo descriptions + SEO
 * =============================================================================
 *
 * Uses Anthropic Messages API with the image (resized via sharp) to propose:
 *   title, category, description, altText, seoTitle, seoDescription, keywords,
 *   and optional field-note guesses (coord / cond / whenShot).
 *
 * Env:
 *   ANTHROPIC_API_KEY   required
 *   ANTHROPIC_MODEL     optional (default claude-sonnet-4-5)
 *
 * Admin routes call enrichOne / enrichMany. Nothing runs automatically on
 * upload — the photographer reviews AI copy in /admin before it goes live.
 * =============================================================================
 */
import Anthropic from '@anthropic-ai/sdk';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { mediaUrl, uploadDir } from './upload.config';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';

export type EnrichmentDraft = {
  title: string;
  category: string;
  description: string;
  altText: string;
  seoTitle: string;
  seoDescription: string;
  keywords: string;
  coord?: string;
  cond?: string;
  whenShot?: string;
};

const CATEGORIES = [
  'Harbor & Fleet',
  'Creek Street',
  'Totem Poles',
  'Misty Fjords',
  'Wildlife',
  'Weather & Light',
  'Aerials',
  'Mountains',
  'Planes',
  'Boats',
  'Harbor',
  'Aurora',
  'Culture',
];

@Injectable()
export class ClaudeEnrichService {
  private readonly logger = new Logger(ClaudeEnrichService.name);

  constructor(private readonly prisma: PrismaService) {}

  isConfigured(): boolean {
    return Boolean((process.env.ANTHROPIC_API_KEY || '').trim());
  }

  status() {
    return {
      configured: this.isConfigured(),
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
    };
  }

  private client(): Anthropic {
    const key = (process.env.ANTHROPIC_API_KEY || '').trim();
    if (!key) {
      throw new BadRequestException(
        'ANTHROPIC_API_KEY is not set. Add it in Railway Variables (https://console.anthropic.com/).',
      );
    }
    return new Anthropic({ apiKey: key });
  }

  async getImageForVision(photoId: number): Promise<{
    mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
    base64: string;
    bytes: number;
  }> {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
      include: { blob: true },
    });
    if (!photo) throw new NotFoundException(`Photo ${photoId} not found`);

    let raw: Buffer | null = null;
    if (photo.blob?.data) {
      raw = Buffer.from(photo.blob.data);
    } else {
      const disk = join(uploadDir(), photo.filename);
      if (existsSync(disk)) raw = await readFile(disk);
    }
    if (!raw?.length) {
      throw new BadRequestException(
        `Photo ${photoId} has no image data — re-upload it first.`,
      );
    }

    // Anthropic recommends keeping images under ~5 MB; resize long edge.
    const jpeg = await sharp(raw)
      .rotate()
      .resize({
        width: 1568,
        height: 1568,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    return {
      mediaType: 'image/jpeg',
      base64: jpeg.toString('base64'),
      bytes: jpeg.length,
    };
  }

  async analyzePhoto(photoId: number): Promise<EnrichmentDraft> {
    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo) throw new NotFoundException(`Photo ${photoId} not found`);

    const image = await this.getImageForVision(photoId);
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

    const prompt = `You are an SEO copywriter and photo editor for Ketchikan Photos, a fine-art photography site about Ketchikan and Southeast Alaska (Tongass rainforest, Inside Passage, fishing fleet, Creek Street, Misty Fjords, wildlife, weather).

Study the photograph and return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "title": "short evocative title, max 70 chars, no trailing period",
  "category": "one of: ${CATEGORIES.join(' | ')}",
  "description": "2-3 sentences for the lightbox caption; sensory and place-specific; max 400 chars",
  "altText": "accessible alt text describing the visible scene; max 125 chars; do not start with 'Image of'",
  "seoTitle": "search-friendly title under 60 chars including a place or subject keyword",
  "seoDescription": "meta description 140-155 chars; include Ketchikan or Southeast Alaska when natural; invite print interest without spam",
  "keywords": "5-12 comma-separated keywords (places, subjects, moods)",
  "coord": "optional guessed coordinates as 55.xxx°N 131.xxx°W or empty string if unsure",
  "cond": "optional weather/light guess like Overcast · soft rain, or empty string",
  "whenShot": "optional time-of-day guess like 06:40 or Dusk, or empty string"
}

Current catalog fields (may be wrong — prefer what you see):
- title: ${JSON.stringify(photo.title)}
- category: ${JSON.stringify(photo.category)}
- media: ${mediaUrl(photo.filename)}

Rules:
- Do not invent specific wildlife species you cannot verify from the image.
- Prefer accurate Southeast Alaska geography over generic "Alaska".
- No hashtags. No emoji. No keyword stuffing.`;

    const anthropic = this.client();
    this.logger.log(
      `Claude enrich photo #${photoId} (${image.bytes} bytes jpeg) model=${model}`,
    );

    const message = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: image.mediaType,
                data: image.base64,
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });

    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('\n')
      .trim();

    return this.parseDraft(text, photo.title, photo.category);
  }

  private parseDraft(
    raw: string,
    fallbackTitle: string,
    fallbackCategory: string,
  ): EnrichmentDraft {
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      this.logger.error(`Claude returned non-JSON: ${cleaned.slice(0, 240)}`);
      throw new BadRequestException(
        'Claude returned unreadable JSON — try again.',
      );
    }

    const str = (k: string, max: number, fallback = '') => {
      const v = data[k];
      const s = typeof v === 'string' ? v.trim() : fallback;
      return s.slice(0, max);
    };

    let category = str('category', 80, fallbackCategory);
    if (!CATEGORIES.includes(category)) {
      const match = CATEGORIES.find(
        (c) => c.toLowerCase() === category.toLowerCase(),
      );
      category = match || fallbackCategory || 'Weather & Light';
    }

    return {
      title: str('title', 70, fallbackTitle) || fallbackTitle,
      category,
      description: str('description', 500),
      altText: str('altText', 160),
      seoTitle: str('seoTitle', 70),
      seoDescription: str('seoDescription', 170),
      keywords: str('keywords', 300),
      coord: str('coord', 64),
      cond: str('cond', 120),
      whenShot: str('whenShot', 40),
    };
  }

  async enrichOne(
    photoId: number,
    opts: {
      apply?: boolean;
      overwriteTitle?: boolean;
      overwriteCategory?: boolean;
      fillEmptyFieldNotes?: boolean;
    } = {},
  ) {
    const apply = opts.apply !== false;
    const draft = await this.analyzePhoto(photoId);
    if (!apply) {
      return { applied: false, draft, photo: null };
    }

    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo) throw new NotFoundException(`Photo ${photoId} not found`);

    const data: Record<string, unknown> = {
      description: draft.description,
      altText: draft.altText,
      seoTitle: draft.seoTitle,
      seoDescription: draft.seoDescription,
      keywords: draft.keywords,
      aiEnrichedAt: new Date(),
    };

    if (opts.overwriteTitle !== false) data.title = draft.title;
    if (opts.overwriteCategory !== false) data.category = draft.category;

    if (opts.fillEmptyFieldNotes !== false) {
      if (!photo.coord?.trim() && draft.coord) data.coord = draft.coord;
      if (!photo.cond?.trim() && draft.cond) data.cond = draft.cond;
      if (!photo.whenShot?.trim() && draft.whenShot) data.whenShot = draft.whenShot;
    }

    const updated = await this.prisma.photo.update({
      where: { id: photoId },
      data,
    });

    return { applied: true, draft, photo: updated };
  }

  async enrichMany(
    opts: {
      onlyMissing?: boolean;
      limit?: number;
      overwriteTitle?: boolean;
      overwriteCategory?: boolean;
    } = {},
  ) {
    const onlyMissing = opts.onlyMissing !== false;
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 40);

    const rows = await this.prisma.photo.findMany({
      where: {
        blob: { isNot: null },
        ...(onlyMissing
          ? {
              OR: [
                { description: '' },
                { altText: '' },
                { seoDescription: '' },
                { aiEnrichedAt: null },
              ],
            }
          : {}),
      },
      orderBy: { id: 'asc' },
      take: limit,
      select: { id: true, title: true },
    });

    const results: {
      id: number;
      title: string;
      ok: boolean;
      error?: string;
      draft?: EnrichmentDraft;
    }[] = [];

    for (const row of rows) {
      try {
        const out = await this.enrichOne(row.id, {
          apply: true,
          overwriteTitle: opts.overwriteTitle,
          overwriteCategory: opts.overwriteCategory,
        });
        results.push({
          id: row.id,
          title: out.draft.title,
          ok: true,
          draft: out.draft,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Enrich failed';
        this.logger.warn(`Enrich #${row.id} failed: ${message}`);
        results.push({ id: row.id, title: row.title, ok: false, error: message });
      }
    }

    return {
      processed: results.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }
}
