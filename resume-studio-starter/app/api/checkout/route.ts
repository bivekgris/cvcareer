import { NextResponse } from 'next/server';
import { billingClient, billingCustomer, returnUrl } from '../../../lib/billing';
import { apiError, AppError, getAccount } from '../../../lib/server-account';

export async function POST(request: Request) {
  try {
    const user = await getAccount(request);
    const { plan } = await request.json().catch(() => ({})) ?? {};
    if (plan !== 'pack' && plan !== 'pro' && plan !== 'manage') throw new AppError('Choose a valid plan.', 400);

    const stripe = billingClient();
    const root = returnUrl();
    const customer = await billingCustomer(user, plan === 'manage' ? undefined : stripe);
    if (!customer) throw new AppError('There is no billing account to manage yet.', 404);

    if (plan === 'manage') {
      root.searchParams.set('view', 'account');
      const portal = await stripe.billingPortal.sessions.create({ customer, return_url: root.href });
      return NextResponse.json({ url: portal.url });
    }

    const priceId = plan === 'pack' ? process.env.STRIPE_ONE_OFF_PRICE_ID : process.env.STRIPE_PRO_PRICE_ID;
    if (!priceId) throw new AppError('This plan is being set up.', 503);
    const price = await stripe.prices.retrieve(priceId);
    if (!price.active || price.currency !== 'aud' || price.unit_amount !== (plan === 'pack' ? 299 : 1299) ||
        (plan === 'pack' ? price.type !== 'one_time' : price.recurring?.interval !== 'month' || price.recurring.interval_count !== 1)) {
      throw new AppError('The Stripe price does not match this plan.', 503);
    }

    if (plan === 'pro') {
      const subscriptions = await stripe.subscriptions.list({ customer, status: 'all', limit: 100 });
      if (subscriptions.data.some(subscription => !['canceled', 'incomplete_expired'].includes(subscription.status))) {
        throw new AppError('Manage your existing subscription from your account.', 409);
      }
    }

    const open = await stripe.checkout.sessions.list({ customer, status: 'open', limit: 10 });
    const existing = open.data.find(session => session.metadata?.hiredly_plan === plan);
    if (existing?.url) return NextResponse.json({ url: existing.url });

    const success = new URL(root);
    success.searchParams.set('checkout', 'success');
    root.searchParams.set('checkout', 'cancelled');
    const session = await stripe.checkout.sessions.create({
      customer,
      mode: plan === 'pack' ? 'payment' : 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { hiredly_plan: plan },
      success_url: success.href,
      cancel_url: root.href,
    }, { idempotencyKey: ['hiredly-checkout', user.id, plan, Math.floor(Date.now() / 60_000)].join('-') });

    if (!session.url) throw new AppError('Checkout could not be opened. Try again shortly.', 502);
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return apiError(error);
  }
}
