import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout/checkout.controller';
import { CheckoutService } from './checkout/checkout.service';
import { OrdersService } from './orders/orders.service';
import { PhotosController } from './photos/photos.controller';
import { PhotosService } from './photos/photos.service';
import { PrismaService } from './prisma/prisma.service';
import { ProdigiService } from './prodigi/prodigi.service';
import { WebhookController } from './webhook/webhook.controller';

@Module({
  controllers: [CheckoutController, WebhookController, PhotosController],
  providers: [
    PrismaService,
    CheckoutService,
    OrdersService,
    ProdigiService,
    PhotosService,
  ],
})
export class AppModule {}
