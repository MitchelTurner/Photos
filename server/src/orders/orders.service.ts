/**
 * =============================================================================
 * Order lifecycle after Checkout
 * =============================================================================
 *
 * pending  → created in CheckoutService before Stripe redirect
 * paid     → Stripe session payment_status=paid (webhook or status poll)
 * fulfilling → Prodigi create-order in flight / about to run
 * fulfilled  → prodigiOrderId stored
 * failed     → Stripe or Prodigi error recorded in fulfillError
 *
 * recordPaid is idempotent: if prodigiOrderId already exists, retries no-op.
 * Fulfillment errors after a successful charge do NOT fail the Stripe webhook
 * response in a way that causes endless retries for unrecoverable asset issues
 * — check Order.fulfillError in the database / logs.
 * =============================================================================
 */
import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { ProdigiService } from '../prodigi/prodigi.service';
import { getStripe } from '../stripe/stripe-config';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly prodigi: ProdigiService,
  ) {}

  /**
   * Idempotent fulfillment entrypoint.
   * Called from the Stripe webhook (source of truth) and optionally the
   * success page so the customer isn't stuck waiting on webhook delivery.
   */
  async fulfillCheckout(sessionId: string): Promise<{ orderId: string; status: string }> {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return { orderId: session.metadata?.orderId || '', status: 'unpaid' };
    }

    return this.recordPaid(session);
  }

  async recordPaid(session: Stripe.Checkout.Session) {
    const orderId =
      session.metadata?.orderId || session.client_reference_id || undefined;

    let order = orderId
      ? await this.prisma.order.findUnique({
          where: { id: orderId },
          include: { items: true },
        })
      : null;

    if (!order && session.id) {
      order = await this.prisma.order.findUnique({
        where: { stripeSessionId: session.id },
        include: { items: true },
      });
    }

    if (!order) {
      this.logger.error(
        `No local order for Stripe session ${session.id} (orderId=${orderId})`,
      );
      throw new Error(`Order not found for session ${session.id}`);
    }

    // Already submitted to Prodigi — webhook / success page retries are safe.
    if (order.prodigiOrderId) {
      return { orderId: order.id, status: order.status };
    }

    const shipping = this.extractShipping(session);
    const email =
      session.customer_details?.email ||
      session.customer_email ||
      order.email;
    const phone = session.customer_details?.phone || order.phone;

    order = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'paid',
        stripeSessionId: session.id,
        email: email || undefined,
        phone: phone || undefined,
        amountTotal: session.amount_total ?? undefined,
        currency: session.currency || undefined,
        shippingName: shipping?.name || undefined,
        shippingLine1: shipping?.address?.line1 || undefined,
        shippingLine2: shipping?.address?.line2 || undefined,
        shippingCity: shipping?.address?.city || undefined,
        shippingState: shipping?.address?.state || undefined,
        shippingPostal: shipping?.address?.postal_code || undefined,
        shippingCountry: shipping?.address?.country || undefined,
      },
      include: { items: true },
    });

    if (!this.prodigi.isConfigured()) {
      this.logger.warn(
        `Order ${order.id} paid but PRODIGI_API_KEY unset — skipping fulfillment`,
      );
      return { orderId: order.id, status: order.status };
    }

    // Claim fulfillment so concurrent webhook + success-page calls don't
    // submit duplicate Prodigi orders.
    const claimed = await this.prisma.order.updateMany({
      where: {
        id: order.id,
        prodigiOrderId: null,
        status: { in: ['paid', 'pending', 'failed'] },
      },
      data: { status: 'fulfilling', fulfillError: null },
    });

    if (claimed.count === 0) {
      const current = await this.prisma.order.findUnique({
        where: { id: order.id },
      });
      return {
        orderId: order.id,
        status: current?.status || 'fulfilling',
      };
    }

    try {
      const prodigi = await this.prodigi.createOrder(order);
      const fulfilled = await this.prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'fulfilled',
          prodigiOrderId: prodigi.id,
          prodigiStatus: prodigi.status || 'submitted',
          fulfillError: null,
        },
      });
      this.logger.log(
        `Order ${order.id} → Prodigi ${prodigi.id} (${prodigi.status || 'ok'})`,
      );
      return { orderId: fulfilled.id, status: fulfilled.status };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Prodigi fulfill failed for ${order.id}: ${message}`);
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'failed',
          fulfillError: message.slice(0, 1000),
        },
      });
      // Don't fail the Stripe webhook acknowledgement — payment already succeeded.
      // Operator can retry fulfillment from logs / DB.
      return { orderId: order.id, status: 'failed' };
    }
  }

  private extractShipping(session: Stripe.Checkout.Session): {
    name?: string | null;
    address?: Stripe.Address | null;
  } | null {
    // Newer API shapes may nest under collected_information.
    const collected = (
      session as Stripe.Checkout.Session & {
        collected_information?: {
          shipping_details?: {
            name?: string | null;
            address?: Stripe.Address | null;
          } | null;
        } | null;
        shipping_details?: {
          name?: string | null;
          address?: Stripe.Address | null;
        } | null;
      }
    ).collected_information?.shipping_details;

    if (collected) return collected;

    const legacy = (
      session as Stripe.Checkout.Session & {
        shipping_details?: {
          name?: string | null;
          address?: Stripe.Address | null;
        } | null;
      }
    ).shipping_details;

    return legacy || null;
  }
}
