
import { Router } from 'express';
import { z } from 'zod';
import { parse, fail, ah } from '../lib/errors.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import * as statsService from '../services/stats.js';
import * as ordersService from '../services/orders.js';
import * as reviewsService from '../services/reviews.js';
import { Products, Variants, Coupons, Outbox, Audit } from '../repositories/index.js';
import * as mailer from '../services/mailer.js';
import { id, nowIso } from '../lib/ids.js';

const router = Router();
router.use(requireAuth, requireAdmin);

function audit(req, action, detail){
  Audit.insert({ id: id('aud'), at: nowIso(), admin: req.user.email, action, detail: detail || null });
}

router.get('/stats', ah((req, res) => res.json(statsService.adminStats())));

router.get('/orders', ah((req, res) => {
  res.json({ orders: ordersService.adminList({ status: req.query.status }) });
}));

router.patch('/orders/:orderNumber/status', ah(async (req, res) => {
  const body = parse(z.object({
    status: z.enum(['pending', 'paid', 'packed', 'shipped', 'delivered', 'cancelled']),
    note: z.string().max(200).optional()
  }), req.body);
  const order = ordersService.getByNumber(req.params.orderNumber);
  if(!order) fail(404, 'NOT_FOUND', 'No order with that number.');
  const fresh = await ordersService.updateStatus(order, body.status, body.note);
  audit(req, 'order.status', `${order.orderNumber} → ${body.status}`);
  res.json({ order: fresh });
}));

router.get('/reviews', ah((req, res) => {
  res.json({ reviews: reviewsService.adminList({ status: req.query.status }) });
}));

router.patch('/reviews/:id/status', ah((req, res) => {
  const body = parse(z.object({ status: z.enum(['pending', 'published', 'rejected']) }), req.body);
  const review = reviewsService.moderate(req.params.id, body.status);
  audit(req, 'review.moderate', `${review.id} → ${body.status}`);
  res.json({ review });
}));

router.delete('/reviews/:id', ah((req, res) => {
  reviewsService.remove(req.params.id);
  audit(req, 'review.delete', req.params.id);
  res.json({ ok: true });
}));

router.patch('/products/:id', ah((req, res) => {
  const body = parse(z.object({
    priceCents: z.coerce.number().int().min(1).max(1_000_000).optional(),
    active: z.boolean().optional(),
    description: z.string().max(600).optional()
  }), req.body);
  if(!Products.get(req.params.id)) fail(404, 'NOT_FOUND', 'No such product.');
  const product = Products.update(req.params.id, body);
  audit(req, 'product.update', req.params.id);
  res.json({ product });
}));

router.post('/inventory/adjust', ah((req, res) => {
  const body = parse(z.object({
    sku: z.string().min(3),
    set: z.coerce.number().int().min(0).max(9999).optional(),
    delta: z.coerce.number().int().min(-9999).max(9999).optional()
  }).refine(d => d.set !== undefined || d.delta !== undefined, { message: 'Provide either "set" or "delta".' }), req.body);
  const variant = Variants.get(body.sku);
  if(!variant) fail(404, 'NOT_FOUND', 'No such SKU.');
  const stock = body.set !== undefined ? body.set : Math.max(0, variant.stock + body.delta);
  const updated = Variants.update(body.sku, { stock });
  audit(req, 'inventory.adjust', `${body.sku} → ${stock}`);
  res.json({ variant: updated });
}));

router.get('/outbox', ah((req, res) => {
  const rows = Outbox.all()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100)
    .map(({ html, text, ...rest }) => rest); // bodies stay out of list responses
  res.json({ messages: rows });
}));

router.post('/outbox/:id/resend', ah(async (req, res) => {
  const doc = Outbox.get(req.params.id);
  if(!doc) fail(404, 'NOT_FOUND', 'No such message.');
  await mailer.deliver(doc);
  audit(req, 'outbox.resend', doc.id);
  res.json({ message: Outbox.get(doc.id) });
}));

router.get('/audit', ah((req, res) => {
  res.json({ entries: Audit.all().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100) });
}));

// ── Coupons ───────────────────────────────────────────────────────────

router.get('/coupons', ah((req, res) => {
  const coupons = Coupons.all()
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  res.json({ coupons });
}));

router.post('/coupons', ah((req, res) => {
  const body = parse(z.object({
    code: z.string().min(2).max(30),
    type: z.enum(['percent', 'fixed']),
    value: z.coerce.number().int().min(1),
    minSubtotalCents: z.coerce.number().int().min(0).optional(),
    maxUses: z.coerce.number().int().min(1).optional(),
    expiresAt: z.string().optional(),
    active: z.boolean().optional()
  }), req.body);
  const code = body.code.toUpperCase().trim();
  if(Coupons.first(c => c.code === code)){
    fail(409, 'CONFLICT', 'A coupon with this code already exists.');
  }
  const coupon = Coupons.insert({
    id: id('coup'), code,
    type: body.type,
    value: body.value,
    minSubtotalCents: body.minSubtotalCents || 0,
    maxUses: body.maxUses || null,
    expiresAt: body.expiresAt || null,
    active: body.active !== false,
    usedCount: 0,
    createdAt: nowIso()
  });
  audit(req, 'coupon.create', code);
  res.status(201).json({ coupon });
}));

router.patch('/coupons/:id', ah((req, res) => {
  const body = parse(z.object({
    active: z.boolean().optional(),
    value: z.coerce.number().int().min(1).optional(),
    maxUses: z.coerce.number().int().min(1).optional(),
    expiresAt: z.string().optional(),
    minSubtotalCents: z.coerce.number().int().min(0).optional()
  }), req.body);
  const coupon = Coupons.get(req.params.id);
  if(!coupon) fail(404, 'NOT_FOUND', 'No such coupon.');
  const updated = Coupons.update(req.params.id, body);
  audit(req, 'coupon.update', coupon.code);
  res.json({ coupon: updated });
}));

router.delete('/coupons/:id', ah((req, res) => {
  const coupon = Coupons.get(req.params.id);
  if(!coupon) fail(404, 'NOT_FOUND', 'No such coupon.');
  Coupons.remove(req.params.id);
  audit(req, 'coupon.delete', coupon.code);
  res.json({ ok: true });
}));

export default router;
