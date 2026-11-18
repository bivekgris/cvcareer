import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { billingClient, stripeId } from '../../../../lib/billing';
import { adminDatabase, apiError, AppError } from '../../../../lib/server-account';

type Grant = {
  source: string;
  allowance: number;
  expires_at?: string;
  subscription_id?: string;
};

async function addGrant(customer: string | undefined, grant: Grant) {
  if (!customer) return;
  const db = adminDatabase();
  const { data, error } = await db.from('billing_customers').select('user_id')
    .eq('stripe_customer', customer).maybeSingle();
  if (error) throw error;
  if (!data) return;

  const { error: writeError } = await db.from('application_grants').upsert({
    ...grant, user_id: data.user_id, remaining: grant.allowance,
  }, { onConflict: 'source', ignoreDuplicates: true });
  if (writeError) throw writeError;
}

async function fulfilPack(stripe: Stripe, id: string) {
  const session = await stripe.checkout.sessions.retrieve(id, { expand: ['line_items'] });
  const payment = stripeId(session.payment_intent);
  const items = session.line_items?.data;
  if (session.mode !== 'payment' || session.payment_status !== 'paid' ||
      session.currency !== 'aud' || session.amount_total !== 299 || !payment ||
      !items || items.length !== 1 || items[0].quantity !== 1 ||
      items[0].price?.id !== process.env.STRIPE_ONE_OFF_PRICE_ID) return;
  await addGrant(stripeId(session.customer), { source: 'pack:' + payment, allowance: 1 });
}

async function fulfilPro(stripe: Stripe, id: string) {
  const invoice = await stripe.invoices.retrieve(id);
  const subscriptionId = stripeId(invoice.parent?.subscription_details?.subscription);
  if (!subscriptionId || invoice.status !== 'paid' || invoice.currency !== 'aud' ||
      invoice.amount_paid !== 1299 || !['subscription_create', 'subscription_cycle'].includes(invoice.billing_reason ?? '')) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (['canceled', 'incomplete_expired'].includes(subscription.status)) return;

  const line = invoice.lines.data.find(item =>
    stripeId(item.pricing?.price_details?.price) === process.env.STRIPE_PRO_PRICE_ID);
  if (!line || line.period.end <= Date.now() / 1000) return;

  await addGrant(stripeId(invoice.customer), {
    source: ['pro', subscriptionId, line.period.start].join(':'),
    allowance: 15,
    subscription_id: subscriptionId,
    expires_at: new Date(line.period.end * 1000).toISOString(),
  });
}

export async function POST(request: Request) {
  try {
    const stripe = billingClient();
    const secret = process.env.STRIPE_WEBHOOK_SECRET!;
    const signature = request.headers.get('stripe-signature');
    if (!signature) throw new AppError('Missing Stripe signature.', 400);
    let event: Stripe.Event;
    try { event = stripe.webhooks.constructEvent(await request.text(), signature, secret); }
    catch { throw new AppError('Invalid Stripe signature.', 400); }
    if (event.livemode) throw new AppError('Only test events are accepted.', 400);

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        if (event.data.object.metadata?.hiredly_plan === 'pack') {
          await fulfilPack(stripe, event.data.object.id);
        }
        break;
      case 'invoice.paid':
        await fulfilPro(stripe, event.data.object.id);
        break;
      case 'customer.subscription.deleted': {
        const { error } = await adminDatabase().from('application_grants')
          .update({ revoked: true }).eq('subscription_id', event.data.object.id);
        if (error) throw error;
        break;
      }
      case 'charge.refunded': {
        const payment = stripeId(event.data.object.payment_intent);
        if (payment && event.data.object.refunded) {
          const { error } = await adminDatabase().from('application_grants')
            .update({ revoked: true }).eq('source', 'pack:' + payment);
          if (error) throw error;
        }
        break;
      }
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    return apiError(error);
  }
}
