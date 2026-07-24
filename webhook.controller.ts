import {
  BadRequestException, Controller, Headers, Post, RawBodyRequest, Req,
} from '@nestjs/common';
import { Request } from 'express';
import Stripe from 'stripe';
import { OrdersService } from '../orders/orders.service';

@Controller('webhook')
export class WebhookController {
  private readonly stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

  constructor(private readonly orders: OrdersService) {}

  /**
   * POST /webhook/stripe
   * Needs the RAW request body for signature verification — see main.ts
   * (rawBody: true) and the note in README about the JSON body-parser.
   */
  @Post('stripe')
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        req.rawBody as Buffer,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET as string,
      );
    } catch (err) {
      throw new BadRequestException(
        `Webhook signature verification failed: ${(err as Error).message}`,
      );
    }

    if (event.type === 'checkout.session.completed') {
      await this.orders.recordPaid(event.data.object as Stripe.Checkout.Session);
    }

    return { received: true };
  }
}
