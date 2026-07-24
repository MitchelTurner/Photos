import { Injectable, Logger } from '@nestjs/common';
import { Order, OrderItem } from '@prisma/client';
import { resolvePrintAssetUrl } from '../photos';

type OrderWithItems = Order & { items: OrderItem[] };

export type ProdigiCreateOrderResult = {
  id: string;
  status?: string;
};

@Injectable()
export class ProdigiService {
  private readonly logger = new Logger(ProdigiService.name);

  private get baseUrl(): string {
    return (
      process.env.PRODIGI_API_BASE?.replace(/\/$/, '') ||
      'https://api.sandbox.prodigi.com/v4.0'
    );
  }

  private get apiKey(): string {
    return process.env.PRODIGI_API_KEY || '';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async createOrder(order: OrderWithItems): Promise<ProdigiCreateOrderResult> {
    if (!this.apiKey) {
      throw new Error('PRODIGI_API_KEY is not configured');
    }
    if (!order.shippingName || !order.shippingLine1 || !order.shippingCity) {
      throw new Error('Order is missing shipping address for Prodigi');
    }
    if (!order.shippingCountry || !order.shippingPostal) {
      throw new Error('Order is missing shipping country/postal for Prodigi');
    }

    const items = order.items.map((item) => {
      const url = resolvePrintAssetUrl(item.photoId);
      if (!url) {
        throw new Error(
          `No print asset URL for photoId=${item.photoId}. Set PHOTO_ASSETS, PRINT_ASSET_BASE_URL, or PRODIGI_FALLBACK_ASSET_URL.`,
        );
      }
      return {
        merchantReference: `${item.photoId}-${item.sizeKey}`,
        sku: item.sku,
        copies: item.quantity,
        sizing: 'fillPrintArea',
        assets: [
          {
            printArea: 'default',
            url,
          },
        ],
      };
    });

    const body = {
      merchantReference: order.id,
      shippingMethod: process.env.PRODIGI_SHIPPING_METHOD || 'Standard',
      recipient: {
        name: order.shippingName,
        email: order.email || undefined,
        phoneNumber: order.phone || undefined,
        address: {
          line1: order.shippingLine1,
          line2: order.shippingLine2 || undefined,
          postalOrZipCode: order.shippingPostal,
          countryCode: order.shippingCountry,
          townOrCity: order.shippingCity,
          stateOrCounty: order.shippingState || undefined,
        },
      },
      items,
      metadata: {
        stripeSessionId: order.stripeSessionId || '',
        source: 'ketchikanphotos',
      },
    };

    const res = await fetch(`${this.baseUrl}/Orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let json: {
      order?: { id?: string; status?: { stage?: string } };
      id?: string;
      outcome?: string;
      failures?: unknown;
      errorCode?: string;
      message?: string;
    };
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      throw new Error(
        `Prodigi returned non-JSON (${res.status}): ${text.slice(0, 400)}`,
      );
    }

    if (!res.ok) {
      this.logger.error(`Prodigi create order failed: ${text}`);
      throw new Error(
        `Prodigi ${res.status}: ${json.message || json.errorCode || text.slice(0, 400)}`,
      );
    }

    const id = json.order?.id || json.id;
    if (!id) {
      throw new Error(`Prodigi response missing order id: ${text.slice(0, 400)}`);
    }

    return {
      id,
      status: json.order?.status?.stage || json.outcome,
    };
  }
}
