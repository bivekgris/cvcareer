import Stripe from 'stripe';
import type { User } from '@supabase/supabase-js';
import { adminDatabase, AppError } from './server-account';

export function billingClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !/^(sk|rk)_test_/.test(key) || !process.env.STRIPE_WEBHOOK_SECRET) {
    throw new AppError('Checkout is available when Stripe test billing is configured.', 503);
  }
  return new Stripe(key, { timeout: 12_000, maxNetworkRetries: 1 });
}

export function returnUrl() {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) throw new AppError('The billing return URL is not configured.', 503);
  return new URL('/', url);
}

export function stripeId(value: string | { id: string } | null | undefined) {
  return typeof value === 'string' ? value : value?.id;
}

export async function billingCustomer(user: User, stripe?: Stripe) {
  const db = adminDatabase();
  const { data, error } = await db.from('billing_customers').select('stripe_customer')
    .eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  if (data) return data.stripe_customer as string;
  if (!stripe) return null;

  const customer = await stripe.customers.create({ metadata: { account_id: user.id } },
    { idempotencyKey: 'hiredly-customer-' + user.id });
  const { error: insertError } = await db.from('billing_customers').upsert({
    user_id: user.id, stripe_customer: customer.id,
  });
  if (insertError) throw insertError;
  return customer.id;
}
