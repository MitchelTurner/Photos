import { Module } from '@nestjs/common';
import { AuthController, HealthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { CheckoutController } from './checkout/checkout.controller';
import { CheckoutService } from './checkout/checkout.service';
import { OrdersService } from './orders/orders.service';
import { AdminGuard } from './photos/admin.guard';
import { PhotosController } from './photos/photos.controller';
import { PhotosService } from './photos/photos.service';
import { PrismaService } from './prisma/prisma.service';
import { ProdigiService } from './prodigi/prodigi.service';
import { WebhookController } from './webhook/webhook.controller';

@Module({
  controllers: [
    HealthController,
    AuthController,
    CheckoutController,
    WebhookController,
    PhotosController,
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
