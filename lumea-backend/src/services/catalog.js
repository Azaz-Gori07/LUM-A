
import { Products, Variants } from '../repositories/index.js';
import { fail } from '../lib/errors.js';

// How each piece runs — shared by the fit engine and the shop.
export const FIELD_NOTES = {
  aerin:     { scale: 50, note: 'Runs true. Right in the middle of the range — holds its shape all day.' },
  aerinlong: { scale: 50, note: 'Shares the Aerin block — true in the band, generous through the ribs.' },
  noe:       { scale: 38, note: 'A touch small in the cup — between cups, take the fuller one.' },
  lune:      { scale: 64, note: 'Knit relaxes to you over two weeks — generous by design, on purpose.' },
  vela:      { scale: 47, note: 'Bias-cut silk — true, with a half-size of grace either way.' },
  lunebody:  { scale: 60, note: 'Follows the Lune knit — size with your band, not your bust.' }
};

export const availableOf = variant => Math.max(0, (variant.stock || 0) - (variant.reserved || 0));

const SORT_MAP = {
  price_asc:  (a, b) => a.priceCents - b.priceCents,
  price_desc: (a, b) => b.priceCents - a.priceCents,
  name_asc:   (a, b) => a.name.localeCompare(b.name),
  name_desc:  (a, b) => b.name.localeCompare(a.name),
  newest:     (a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''),
};

export function listProducts({ construction, query, sort, page = 1, limit = 50 } = {}){
  let rows = Products.find(p => p.active && (!construction || p.construction === construction));

  if(query){
    const q = query.toLowerCase();
    rows = rows.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.sub && p.sub.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
  }

  const total = rows.length;

  if(sort && SORT_MAP[sort]){
    rows.sort(SORT_MAP[sort]);
  } else {
    rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  const capped = Math.min(100, Math.max(1, limit));
  const start = (Math.max(1, page) - 1) * capped;
  const items = rows.slice(start, start + capped).map(publicProduct);

  return {
    items,
    page: Math.max(1, page),
    limit: capped,
    total,
    pages: Math.ceil(total / capped)
  };
}

export function getProduct(productId){
  const p = Products.get(productId);
  if(!p || !p.active) fail(404, 'NOT_FOUND', 'That piece is not part of the current run.');
  const variants = Variants.find(v => v.productId === productId)
    .map(v => ({ sku: v.sku, colorway: v.colorway, size: v.size, available: availableOf(v) }));
  return { ...publicProduct(p), variants };
}

export function variantBySku(sku){ return Variants.get(sku) || null; }

function publicProduct(p){
  return {
    id: p.id, name: p.name, sub: p.sub, construction: p.construction,
    priceCents: p.priceCents, description: p.description,
    colorways: p.colorways, sizes: p.sizes,
    fieldNote: FIELD_NOTES[p.id] || { scale: 50, note: 'Runs true.' }
  };
}
