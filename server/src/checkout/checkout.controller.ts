/**
 * POST /checkout
 * Body: { items: [{ photoId: number, sizeKey: string, qty: number }] }
 * Returns: { url: string } — Stripe-hosted Checkout URL for window.location.
 */
import { Body, Controller, Post } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CheckoutDto } from './dto';

@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post()
  create(@Body() dto: CheckoutDto) {
    return this.checkout.createSession(dto);
  }
}
