import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout/checkout.controller';
import { CheckoutService } from './checkout/checkout.service';
import { OrdersService } from './orders/orders.service';
import { PrismaService } from './prisma/prisma.service';
import { ProdigiService } from './prodigi/prodigi.service';
import { WebhookController } from './webhook/webhook.controller';

@Module({
  controllers: [CheckoutController, WebhookController],
  providers: [PrismaService, CheckoutService, OrdersService, ProdigiService],
})
export class AppModule {}
