/**
 * Stripe key helpers.
 *
 * STRIPE_SECRET_KEY must be a secret key:
 *   sk_test_…  or  sk_live_…
 * Publishable keys (pk_…) belong only in the browser — never on the server.
 * Using a pk_ key makes Checkout Session create fail with a Stripe 500-looking
 * error; we catch that early and return a clear BadRequest message instead.
 */
import { BadRequestException } from '@nestjs/common';
import Stripe from 'stripe';

export function stripeSecretKey(): string {
  return (process.env.STRIPE_SECRET_KEY || '').trim();
}

export function assertStripeSecretConfigured(): string {
  const key = stripeSecretKey();
  if (!key) {
    throw new BadRequestException(
      'STRIPE_SECRET_KEY is not configured on the API (Railway Variables).',
    );
  }
  if (key.startsWith('pk_')) {
    throw new BadRequestException(
      'STRIPE_SECRET_KEY is set to a publishable key (pk_…). Replace it with the Secret key (sk_test_… or sk_live_…) from https://dashboard.stripe.com/apikeys',
    );
  }
  if (!key.startsWith('sk_')) {
    throw new BadRequestException(
      'STRIPE_SECRET_KEY looks invalid — expected a key starting with sk_test_ or sk_live_.',
    );
  }
  return key;
}

/** Lazy Stripe client so boot does not crash when the key is missing/wrong. */
let client: Stripe | null = null;
let clientKey = '';

export function getStripe(): Stripe {
  const key = assertStripeSecretConfigured();
  if (!client || clientKey !== key) {
    client = new Stripe(key);
    clientKey = key;
  }
  return client;
}

export function mapStripeError(err: unknown): never {
  if (err instanceof BadRequestException) throw err;
  const message =
    err instanceof Error ? err.message : 'Stripe request failed';
  // Surface common misconfig clearly instead of a bare 500
  if (/publishable API key/i.test(message)) {
    throw new BadRequestException(
      'STRIPE_SECRET_KEY is a publishable key (pk_…). Use the Secret key (sk_…) from the Stripe Dashboard → API keys.',
    );
  }
  if (/Invalid API Key/i.test(message) || /No such api_key/i.test(message)) {
    throw new BadRequestException(
      'Stripe rejected STRIPE_SECRET_KEY — check the value in Railway Variables.',
    );
  }
  if (/Managed Payments/i.test(message) && /shipping/i.test(message)) {
    throw new BadRequestException(
      'Stripe Managed Payments is blocking shipping collection. This API disables managed_payments for print orders — redeploy if you still see this, or turn off Managed Payments default in the Stripe Dashboard.',
    );
  }
  throw new BadRequestException(`Stripe error: ${message}`);
}
