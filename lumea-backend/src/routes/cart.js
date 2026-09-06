
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { parse, fail, ah } from '../lib/errors.js';
import * as cartService from '../services/cart.js';
import * as checkout from '../services/checkout.js';
import * as ordersService from '../services/orders.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rate-limit.js';

const router = Router();

function cartTokenFrom(req){
  return req.cookies[cartService.CART_COOKIE] || null;
}

function currentCart(req, create){
  const ctx = { cartToken: req.cookies[cartService.CART_COOKIE], userId: req.user?.id || null };
  if(create) return cartService.ensureCart({ ...ctx, res: req.res });
  return cartService.findCart(ctx);
}

router.get('/cart', ah((req, res) => {
  res.json(cartService.serialize(currentCart(req, false)));
}));

router.put('/cart/items', ah((req, res) => {
  const body = parse(z.object({ sku: z.string().min(3), qty: z.coerce.number().int().min(0).max(10) }), req.body);
  const cart = cartService.ensureCart({
    cartToken: req.cookies[cartService.CART_COOKIE],
    userId: req.user?.id || null,
    res: req.res
  });
  res.json(cartService.setItem(cart, body.sku, body.qty));
}));

router.delete('/cart', ah((req, res) => {
  cartService.clearCart(currentCart(req, false));
  res.json(cartService.serialize(null));
}));

router.post('/cart/merge', requireAuth, ah((req, res) => {
  res.json(cartService.mergeCarts({ guestToken: req.cookies[cartService.CART_COOKIE], userId: req.user.id }));
}));

router.post('/cart/coupon', ah((req, res) => {
  const body = parse(z.object({ code: z.string().min(1).max(30) }), req.body);
  const cart = cartService.ensureCart({
    cartToken: req.cookies[cartService.CART_COOKIE],
    userId: req.user?.id || null,
    res: req.res
  });
  res.json(cartService.applyCoupon(cart, body.code));
}));

router.delete('/cart/coupon', ah((req, res) => {
  const cart = currentCart(req, false);
  if(!cart) return res.json(cartService.serialize(null));
  res.json(cartService.removeCoupon(cart));
}));

const Address = z.object({
  line1: z.string().min(3).max(120),
  line2: z.string().max(120).optional(),
  city: z.string().min(1).max(80),
  region: z.string().max(80).optional(),
  postal: z.string().min(3).max(16),
  country: z.string().min(2).max(40)
});

const OrderNumber = z.string().regex(/^LUM-\d{2}-\d{4}$/, 'Invalid order number format.');

router.post('/checkout/session', writeLimiter, optionalAuth, ah(async (req, res) => {
  const body = parse(z.object({ email: z.string().email().max(160), address: Address }), req.body);
  const cart = cartService.findCart({ cartToken: cartTokenFrom(req), userId: req.user?.id || null })
    || fail(409, 'CONFLICT', 'Your bag is empty — nothing to check out.');
  const result = await checkout.createOrder({ cart, email: body.email, address: body.address, user: req.user });
  res.status(201).json(result);
}));

router.post('/checkout/confirm', writeLimiter, ah(async (req, res) => {
  const body = parse(z.object({ orderNumber: OrderNumber, confirmToken: z.string().min(16) }), req.body);
  const order = await checkout.confirmSandbox(body);
  res.json({ order });
}));

router.post('/webhooks/stripe', ah(async (req, res) => {
  if(!env.stripeWebhookSecret) fail(400, 'BAD_REQUEST', 'Stripe webhooks are not configured on this deployment.');
  const sig = String(req.headers['stripe-signature'] || '');
  const parts = {};
  sig.split(',').forEach(pair => { const [k, ...rest] = pair.split('='); if(k) parts[k.trim()] = rest.join('='); });
  const payload = `${parts.t || ''}.${req.rawBody?.toString('utf8') || ''}`;
  const expected = crypto.createHmac('sha256', env.stripeWebhookSecret).update(payload).digest('hex');
  const received = parts.v1 || '';
  const ok = expected.length === received.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  if(!ok) fail(401, 'UNAUTHORIZED', 'Webhook signature mismatch.');
  const event = JSON.parse(req.rawBody.toString('utf8'));
  if(event.type === 'payment_intent.succeeded'){
    const orderNumber = event.data?.object?.metadata?.orderNumber;
    if(orderNumber) checkout.markPaid(orderNumber, event.data.object.id);
  }
  res.json({ received: true });
}));

router.get('/orders', requireAuth, ah((req, res) => {
  res.json({ orders: ordersService.listForUser(req.user.id) });
}));

router.get('/orders/:orderNumber', requireAuth, ah((req, res) => {
  parse(z.object({ orderNumber: OrderNumber }), { orderNumber: req.params.orderNumber });
  const order = ordersService.getByNumber(req.params.orderNumber);
  if(!order) fail(404, 'NOT_FOUND', 'No order with that number.');
  if(order.userId !== req.user.id && req.user.role !== 'admin') fail(403, 'FORBIDDEN', 'That order belongs to someone else.');
  res.json({ order });
}));

router.post('/orders/:orderNumber/cancel', requireAuth, ah(async (req, res) => {
  parse(z.object({ orderNumber: OrderNumber }), { orderNumber: req.params.orderNumber });
  const order = ordersService.getByNumber(req.params.orderNumber);
  if(!order) fail(404, 'NOT_FOUND', 'No order with that number.');
  if(order.userId !== req.user.id && req.user.role !== 'admin') fail(403, 'FORBIDDEN', 'That order belongs to someone else.');
  const updated = await ordersService.updateStatus(order, 'cancelled', 'Cancelled by the customer.');
  res.json({ order: updated });
}));

// Guest order lookup: find order by email + order number (no auth required).
router.post('/orders/lookup', writeLimiter, ah((req, res) => {
  const body = parse(z.object({
    email: z.string().email(),
    orderNumber: OrderNumber
  }), req.body);
  const order = ordersService.getByNumber(body.orderNumber);
  if(!order) fail(404, 'NOT_FOUND', 'No order with that number.');
  if(order.email !== body.email.trim().toLowerCase()){
    fail(404, 'NOT_FOUND', 'No order matches that email and number combination.');
  }
  res.json({ order });
}));

export default router;
