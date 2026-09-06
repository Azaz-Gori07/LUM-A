
import { Reviews, Products } from '../repositories/index.js';
import { fail } from '../lib/errors.js';
import { id, nowIso } from '../lib/ids.js';

// Public writes land in a moderation queue — nothing shows until an admin publishes it.
export function create({ productId, name, size, rating, quote }){
  const product = Products.get(productId);
  if(!product || !product.active) fail(404, 'NOT_FOUND', 'That piece is not part of the current run.');
  return Reviews.insert({
    id: id('rev'), productId, name: name.trim(), size, rating,
    quote: quote.trim(), status: 'pending', createdAt: nowIso()
  });
}

export function listPublished({ productId, page = 1, limit = 12 }){
  const capped = Math.min(50, Math.max(1, limit));
  const all = Reviews.find(r => r.status === 'published' && (!productId || r.productId === productId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const start = (Math.max(1, page) - 1) * capped;
  const sum = all.reduce((a, r) => a + r.rating, 0);
  return {
    items: all.slice(start, start + capped),
    page: Math.max(1, page), limit: capped, total: all.length,
    summary: { count: all.length, average: all.length ? Math.round((sum / all.length) * 10) / 10 : null }
  };
}

export function adminList({ status } = {}){
  const rows = status ? Reviews.find(r => r.status === status) : Reviews.all();
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function moderate(reviewId, status){
  if(!Reviews.get(reviewId)) fail(404, 'NOT_FOUND', 'No such review.');
  return Reviews.update(reviewId, { status });
}

export function remove(reviewId){
  if(!Reviews.remove(reviewId)) fail(404, 'NOT_FOUND', 'No such review.');
}
