/**
 * =============================================================================
 * Stripe Checkout session creation
 * =============================================================================
 *
 * Browser sends: { items: [{ photoId, sizeKey, qty }] }  — NEVER a price.
 * Server looks up amount + Prodigi SKU from catalog.ts and verifies the photo
 * is published + forSale + has media (assertForSale).
 *
 * Flow:
 *   1. Create local Order (pending) + OrderItems with frozen amount/sku
 *   2. Create Stripe Checkout Session (success/cancel URLs use SITE_URL)
 *   3. Store stripeSessionId on the Order
 *   4. Return { url } — browser redirects the customer to Stripe
 *
 * Payment confirmation happens in WebhookController → OrdersService.recordPaid.
 * Do not mark orders paid from the success page alone.
 *
 * SITE_URL must be the public site origin customers return to after pay
 * (Railway gallery URL or the custom domain once it serves the new index.html).
 * =============================================================================
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { CATALOG, CURRENCY, isSizeKey } from '../catalog';
import { PhotosService } from '../photos/photos.service';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutDto } from './dto';

@Injectable()
export class CheckoutService {
  private readonly stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

  constructor(
    private readonly prisma: PrismaService,
    private readonly photos: PhotosService,
  ) {}

  async createSession(dto: CheckoutDto): Promise<{ url: string }> {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new BadRequestException('STRIPE_SECRET_KEY is not configured');
    }
    if (!process.env.SITE_URL) {
      throw new BadRequestException('SITE_URL is not configured');
    }

    const normalized = [];
    for (const i of dto.items) {
      if (!isSizeKey(i.sizeKey)) {
        throw new BadRequestException(`Unknown print size: ${i.sizeKey}`);
      }
      const photo = await this.photos.assertForSale(i.photoId);
      const opt = CATALOG[i.sizeKey];
      normalized.push({
        photoId: photo.id,
        title: photo.title,
        sizeKey: i.sizeKey,
        quantity: i.qty,
        amount: opt.amount,
        sku: opt.sku,
        label: opt.label,
      });
    }

    const order = await this.prisma.order.create({
      data: {
        status: 'pending',
        currency: CURRENCY,
        items: {
          create: normalized.map((i) => ({
            photoId: i.photoId,
            title: i.title,
            sizeKey: i.sizeKey,
            quantity: i.quantity,
            amount: i.amount,
            sku: i.sku,
          })),
        },
      },
    });

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] =
      normalized.map((i) => ({
        quantity: i.quantity,
        price_data: {
          currency: CURRENCY,
          unit_amount: i.amount,
          product_data: {
            name: `${i.title} — ${i.label}`,
            metadata: {
              photoId: String(i.photoId),
              sizeKey: i.sizeKey,
              sku: i.sku,
              orderId: order.id,
            },
          },
        },
      }));

    try {
      const session = await this.stripe.checkout.sessions.create({
        mode: 'payment',
        line_items,
        client_reference_id: order.id,
        shipping_address_collection: { allowed_countries: ['US', 'CA'] },
        phone_number_collection: { enabled: true },
        success_url: `${process.env.SITE_URL}/order/success/?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_URL}/?checkout=cancelled`,
        metadata: {
          source: 'ketchikanphotos',
          orderId: order.id,
        },
      });

      if (!session.url) {
        throw new BadRequestException('Stripe did not return a checkout URL');
      }

      await this.prisma.order.update({
        where: { id: order.id },
        data: { stripeSessionId: session.id },
      });

      return { url: session.url };
    } catch (err) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'failed',
          fulfillError: `Stripe session create failed: ${(err as Error).message}`,
        },
      });
      throw err;
    }
  }
}
