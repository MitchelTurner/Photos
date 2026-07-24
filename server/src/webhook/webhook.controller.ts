/**
 * =============================================================================
 * Stripe webhooks + order status
 * =============================================================================
 *
 * Configure Stripe Dashboard (or CLI) to POST to:
 *   https://<PUBLIC_API_URL>/webhook/stripe
 * with events:
 *   - checkout.session.completed
 *   - checkout.session.async_payment_succeeded
 *
 * Signature verification needs the RAW body (see main.ts rawBody: true) and
 * STRIPE_WEBHOOK_SECRET (whsec_…). Never reuse the secret key here.
 *
 * After a paid session, OrdersService copies shipping from Stripe, marks the
 * order paid, and submits a Prodigi print job using each item's catalog SKU
 * and the photo's public /media URL.
 *
 * GET /order/status?session_id=cs_… is a customer-facing status poll used by
 * /order/success/ — it is idempotent with the webhook path.
 * =============================================================================
 */
import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import Stripe from 'stripe';
import { OrdersService } from '../orders/orders.service';

@Controller()
export class WebhookController {
  private readonly stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

  constructor(private readonly orders: OrdersService) {}

  /**
   * POST /webhook/stripe
   * Needs the RAW request body for signature verification — see main.ts
   * (rawBody: true).
   */
  @Post('webhook/stripe')
  async handleStripe(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new BadRequestException('STRIPE_WEBHOOK_SECRET is not configured');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        req.rawBody as Buffer,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      throw new BadRequestException(
        `Webhook signature verification failed: ${(err as Error).message}`,
      );
    }

    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      await this.orders.recordPaid(event.data.object as Stripe.Checkout.Session);
    }

    return { received: true };
  }

  /**
   * GET /order/status?session_id=cs_...
   * Used by the success page to confirm payment / fulfillment progress.
   */
  @Get('order/status')
  async status(@Query('session_id') sessionId: string) {
    if (!sessionId) {
      throw new BadRequestException('session_id is required');
    }
    return this.orders.fulfillCheckout(sessionId);
  }

  /** Convenience alias matching some hosts: GET /order/:sessionId */
  @Get('order/:sessionId')
  async statusByPath(@Param('sessionId') sessionId: string) {
    return this.orders.fulfillCheckout(sessionId);
  }
}
