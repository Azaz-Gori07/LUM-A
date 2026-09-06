
import { env } from '../config/env.js';
import { Orders, Variants, Carts, Coupons } from '../repositories/index.js';
import { fail } from '../lib/errors.js';
import { id, nowIso, randomToken, nextOrderNumber } from '../lib/ids.js';
import { variantBySku, availableOf } from './catalog.js';
import * as mailer from './mailer.js';

export function paymentMode(){
  return env.stripeSecretKey ? 'stripe' : 'sandbox';
}

function snapshotItems(cartItems){
  return cartItems.map(it => {
    const v = variantBySku(it.sku);
    if(!v) fail(409, 'CONFLICT', `A piece in your bag (${it.sku}) is no longer available.`);
    if(it.qty > availableOf(v)) fail(409, 'OUT_OF_STOCK', 'Not enough stock left for that piece.', { sku: it.sku, available: availableOf(v) });
    return { sku: v.sku, productId: v.productId, productName: v.productName, colorway: v.colorway,
      size: v.size, qty: it.qty, unitPriceCents: v.priceCents, lineTotalCents: v.priceCents * it.qty };
  });
}

// Compute totals including coupon discount and tax.
function computeTotals(items, couponCode){
  const subtotal = items.reduce((a, i) => a + i.lineTotalCents, 0);
  let discountCents = 0;
  let couponApplied = null;
  if(couponCode){
    const coupon = Coupons.first(c => c.code === couponCode.toUpperCase() && c.active);
    if(coupon){
      if(!coupon.minSubtotalCents || subtotal >= coupon.minSubtotalCents){
        if(coupon.type === 'percent'){
          discountCents = Math.round(subtotal * (coupon.value / 100));
          couponApplied = { code: coupon.code, type: 'percent', value: coupon.value, discountCents };
        } else if(coupon.type === 'fixed'){
          discountCents = Math.min(coupon.value, subtotal);
          couponApplied = { code: coupon.code, type: 'fixed', value: coupon.value, discountCents };
        }
      }
    }
  }
  const afterDiscount = Math.max(0, subtotal - discountCents);
  const shipping = afterDiscount >= 15_000 || afterDiscount === 0 ? 0 : 800;
  const taxCents = Math.round(afterDiscount * (env.taxRate || 0));
  const totalCents = afterDiscount + shipping + taxCents;
  return { subtotalCents: subtotal, shippingCents: shipping, taxCents, discountCents, totalCents, couponApplied };
}

async function createStripeIntent(orderNumber, amountCents, email){
  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(env.stripeSecretKey);
  return stripe.paymentIntents.create({
    amount: amountCents, currency: 'usd',
    description: `LUMÉA order ${orderNumber}`,
    metadata: { orderNumber },
    receipt_email: email
  });
}

export async function createOrder({ cart, email, address, user }){
  if(!cart || !cart.items.length) fail(409, 'CONFLICT', 'Your bag is empty — nothing to check out.');
  const items = snapshotItems(cart.items);
  const t = computeTotals(items, cart.couponCode);
  const orderNumber = nextOrderNumber();

  let clientSecret = null;
  let payment = { mode: paymentMode(), ref: null };
  if(payment.mode === 'stripe'){
    try{
      const intent = await createStripeIntent(orderNumber, t.totalCents, email);
      payment = { mode: 'stripe', ref: intent.id };
      clientSecret = intent.client_secret;
    }catch(err){
      fail(502, 'PAYMENT_PROVIDER', 'The payment provider could not create a session.');
    }
  }

  const order = Orders.insert({
    id: id('ord'), orderNumber,
    userId: user?.id || null,
    email: email.trim().toLowerCase(),
    status: 'pending',
    items,
    couponCode: cart.couponCode || null,
    subtotalCents: t.subtotalCents, discountCents: t.discountCents,
    shippingCents: t.shippingCents, taxCents: t.taxCents,
    totalCents: t.totalCents,
    currency: 'usd',
    address,
    payment,
    reservedUntil: new Date(Date.now() + env.reservationMs).toISOString(),
    timeline: [{ at: nowIso(), event: 'created', note: 'Order placed — stock reserved.' }],
    createdAt: nowIso(), updatedAt: nowIso()
  });

  // Increment coupon usage count.
  if(cart.couponCode){
    const coupon = Coupons.first(c => c.code === cart.couponCode.toUpperCase() && c.active);
    if(coupon) Coupons.update(coupon.id, { usedCount: (coupon.usedCount || 0) + 1 });
  }

  const confirmToken = payment.mode === 'sandbox' ? randomToken(32) : null;

  for(const it of items){
    const reserved = Variants.update(it.sku, v => {
      const avail = (v.stock || 0) - (v.reserved || 0);
      if(it.qty > avail) fail(409, 'OUT_OF_STOCK', `Only ${avail} left of that piece.`, { sku: it.sku, available: avail });
      return { reserved: (v.reserved || 0) + it.qty };
    });
    if(!reserved) fail(409, 'CONFLICT', `SKU ${it.sku} is no longer available.`);
  }

  if(confirmToken){
    Orders.update(order.id, { confirmToken });
  }

  Carts.update(cart.id, { items: [], couponCode: null, updatedAt: nowIso() });

  return { order, clientSecret, confirmToken };
}

export async function confirmSandbox({ orderNumber, confirmToken }){
  const order = Orders.first(o => o.orderNumber === orderNumber);
  if(!order) fail(404, 'NOT_FOUND', 'No order with that number.');
  if(order.payment.mode !== 'sandbox') fail(400, 'BAD_REQUEST', 'This order was not created in sandbox payment mode.');
  if(!order.confirmToken) fail(400, 'BAD_REQUEST', 'This order has no pending confirmation token.');
  const crypto = await import('node:crypto');
  const a = Buffer.from(order.confirmToken);
  const b = Buffer.from(confirmToken || '');
  if(a.length !== b.length || !crypto.timingSafeEqual(a, b)){
    fail(401, 'UNAUTHORIZED', 'Confirmation token does not match this order.');
  }
  return markPaid(orderNumber, 'sandbox_confirm');
}

export function markPaid(orderNumber, paymentRef){
  const order = Orders.first(o => o.orderNumber === orderNumber);
  if(!order) fail(404, 'NOT_FOUND', 'No order with that number.');
  if(order.status !== 'pending') return order;
  for(const it of order.items){
    Variants.update(it.sku, v => ({
      stock: Math.max(0, v.stock - it.qty),
      reserved: Math.max(0, (v.reserved || 0) - it.qty)
    }));
  }
  Orders.update(order.id, {
    status: 'paid',
    payment: { ...order.payment, ref: paymentRef || order.payment.ref },
    timeline: [...order.timeline, { at: nowIso(), event: 'paid', note: `Payment confirmed (${order.payment.mode}).` }],
    updatedAt: nowIso()
  });
  const fresh = Orders.get(order.id);
  mailer.enqueueOrderConfirmation(fresh);
  return fresh;
}

// Refund a paid order via Stripe (if in Stripe mode).
export async function refundOrder(order){
  if(order.payment.mode !== 'stripe' || !order.payment.ref) return null;
  if(!env.stripeSecretKey) return null;
  try{
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(env.stripeSecretKey);
    const refund = await stripe.refunds.create({
      payment_intent: order.payment.ref,
      amount: order.totalCents,
      reason: 'requested_by_customer'
    });
    return refund.id;
  }catch{
    return null;
  }
}

export function releaseExpired(){
  const now = Date.now();
  const stale = Orders.find(o => o.status === 'pending' && new Date(o.reservedUntil).getTime() < now);
  for(const order of stale){
    for(const it of order.items){
      Variants.update(it.sku, v => ({ reserved: Math.max(0, (v.reserved || 0) - it.qty) }));
    }
    Orders.update(order.id, {
      status: 'cancelled',
      timeline: [...order.timeline, { at: nowIso(), event: 'expired', note: 'Reservation expired — stock released.' }],
      updatedAt: nowIso()
    });
  }
  return stale.length;
}
