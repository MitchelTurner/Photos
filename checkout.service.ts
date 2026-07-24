import { BadRequestException, Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { CATALOG, CURRENCY, isSizeKey } from '../catalog';
import { CheckoutDto } from './dto';

@Injectable()
export class CheckoutService {
  // Omitting apiVersion uses your account's default; pin it once you're in prod.
  private readonly stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

  async createSession(dto: CheckoutDto): Promise<{ url: string }> {
    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] =
      dto.items.map((i) => {
        if (!isSizeKey(i.sizeKey)) {
          throw new BadRequestException(`Unknown print size: ${i.sizeKey}`);
        }
        const opt = CATALOG[i.sizeKey];
        return {
          quantity: i.qty,
          price_data: {
            currency: CURRENCY,
            unit_amount: opt.amount, // price comes from the server, never the client
            product_data: {
              name: `${i.title} — ${opt.label}`,
              metadata: { photoId: String(i.photoId), sizeKey: i.sizeKey },
            },
          },
        };
      });

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      // physical goods → collect where to ship
      shipping_address_collection: { allowed_countries: ['US', 'CA'] },
      phone_number_collection: { enabled: true },
      success_url: `${process.env.SITE_URL}/order/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_URL}/?checkout=cancelled`,
      metadata: { source: 'ketchikanphotos' },
    });

    if (!session.url) {
      throw new BadRequestException('Stripe did not return a checkout URL');
    }
    return { url: session.url };
  }
}
