/**
 * Root Nest module — wires controllers (HTTP routes) to providers (services).
 *
 * Request flow overview:
 *   Browser gallery  → GET /photos → PhotosService.listPublished
 *   Admin upload     → POST /admin/photos[ /bulk ] → PhotosService (+ PhotoBlob)
 *   Image <img src>  → GET /media/:file → MediaController (disk | DB)
 *   Cart checkout    → POST /checkout → CheckoutService → Stripe Checkout Session
 *   Stripe pays      → POST /webhook/stripe → OrdersService.recordPaid → Prodigi
 *   Admin sign-in    → POST /auth/login → AuthService (cookie + bearer token)
 *
 * HealthController is public and includes media counts so you can diagnose an
 * empty gallery without logging in: GET /health → media.withBlob
 */
import { Module } from '@nestjs/common';
import { AdminPageController } from './auth/admin-page.controller';
import { AuthController, HealthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { CheckoutController } from './checkout/checkout.controller';
import { CheckoutService } from './checkout/checkout.service';
import { OrdersService } from './orders/orders.service';
import { AdminGuard } from './photos/admin.guard';
import { MediaController } from './photos/media.controller';
import { PhotosController } from './photos/photos.controller';
import { PhotosService } from './photos/photos.service';
import { PrismaService } from './prisma/prisma.service';
import { ProdigiService } from './prodigi/prodigi.service';
import { WebhookController } from './webhook/webhook.controller';

@Module({
  controllers: [
    HealthController,
    AuthController,
    AdminPageController,
    CheckoutController,
    WebhookController,
    PhotosController,
    MediaController,
  ],
  providers: [
    PrismaService,
    AuthService,
    AdminGuard,
    CheckoutService,
    OrdersService,
    ProdigiService,
    PhotosService,
  ],
})
export class AppModule {}
