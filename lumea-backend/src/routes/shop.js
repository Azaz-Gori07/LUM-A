
import { Router } from 'express';
import { z } from 'zod';
import { parse, fail, ah, stripHtml } from '../lib/errors.js';
import * as catalog from '../services/catalog.js';
import * as fit from '../services/fit.js';
import * as reviews from '../services/reviews.js';
import { Subscribers } from '../repositories/index.js';
import { id, nowIso } from '../lib/ids.js';
import * as mailer from '../services/mailer.js';
import { writeLimiter } from '../middleware/rate-limit.js';

const router = Router();

router.get('/products', ah((req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const sort = req.query.sort || undefined;
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  res.json(catalog.listProducts({ construction: req.query.construction, query: q, sort, page, limit }));
}));

router.get('/products/:id', ah((req, res) => {
  res.json({ product: catalog.getProduct(req.params.id) });
}));

router.get('/fit/sizes', ah((req, res) => {
  res.json({ bands: fit.BANDS, cups: fit.CUPS });
}));

router.post('/fit/size', ah((req, res) => {
  const body = parse(z.object({
    band: z.coerce.number().int(),
    cup: z.enum(fit.CUPS)
  }), req.body);
  if(!fit.BANDS.includes(body.band)) fail(422, 'VALIDATION_ERROR', `Band must be one of ${fit.BANDS.join(', ')}.`);
  res.json(fit.computeFit(body));
}));

router.get('/reviews', ah((req, res) => {
  const productId = typeof req.query.productId === 'string' ? req.query.productId : undefined;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, parseInt(req.query.limit, 10) || 12);
  res.json(reviews.listPublished({ productId, page, limit }));
}));

router.post('/reviews', writeLimiter, ah((req, res) => {
  const raw = parse(z.object({
    productId: z.string().min(1),
    name: z.string().min(1, 'A name is required.').max(80),
    size: z.string().min(1).max(6),
    rating: z.coerce.number().int().min(1).max(5),
    quote: z.string().min(8, 'One honest sentence, at least.').max(400)
  }), req.body);
  const body = { ...raw, name: stripHtml(raw.name), quote: stripHtml(raw.quote) };
  const review = reviews.create(body);
  res.status(202).json({ review, note: 'Thank you — your voice is queued for the wall.' });
}));

router.post('/newsletter', writeLimiter, ah((req, res) => {
  const body = parse(z.object({
    email: z.string().email('A valid email is required.').max(160),
    source: z.string().max(60).optional()
  }), req.body);
  const email = body.email.trim().toLowerCase();
  const existing = Subscribers.first(s => s.email === email);
  if(!existing){
    Subscribers.insert({ id: id('sub'), email, source: body.source || 'site', createdAt: nowIso() });
    mailer.enqueueNewsletterWelcome(email);
  }
  res.status(201).json({ ok: true, note: existing ? 'You are already on the list.' : 'First access lands before the next drop.' });
}));

export default router;
