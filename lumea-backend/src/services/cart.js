
import { Carts, Coupons } from '../repositories/index.js';
import { fail } from '../lib/errors.js';
import { id, nowIso } from '../lib/ids.js';
import { variantBySku, availableOf } from './catalog.js';
import { env } from '../config/env.js';

export const CART_COOKIE = 'lumea_cart';
const FREE_SHIPPING_OVER = 15_000; // $150
const SHIPPING_CENTS = 800;

function totalsFor(items, couponCode){
  let subtotal = 0;
  for(const it of items){
    const variant = variantBySku(it.sku);
    if(!variant) fail(409, 'CONFLICT', `A piece in your bag (${it.sku}) is no longer part of the run.`);
    subtotal += variant.priceCents * it.qty;
  }

  let discountCents = 0;
  let couponApplied = null;
  if(couponCode){
    const coupon = Coupons.first(c => c.code === couponCode.toUpperCase() && c.active);
    if(coupon){
      if(coupon.minSubtotalCents && subtotal < coupon.minSubtotalCents){
        // Coupon not yet eligible — keep it stored but don't apply discount.
      } else if(coupon.type === 'percent'){
        discountCents = Math.round(subtotal * (coupon.value / 100));
        couponApplied = { code: coupon.code, type: 'percent', value: coupon.value, discountCents };
      } else if(coupon.type === 'fixed'){
        discountCents = Math.min(coupon.value, subtotal);
        couponApplied = { code: coupon.code, type: 'fixed', value: coupon.value, discountCents };
      }
    }
  }

  const afterDiscount = Math.max(0, subtotal - discountCents);
  const shipping = afterDiscount >= FREE_SHIPPING_OVER || afterDiscount === 0 ? 0 : SHIPPING_CENTS;
  const taxCents = Math.round(afterDiscount * (env.taxRate || 0));
  const totalCents = afterDiscount + shipping + taxCents;

  return { subtotalCents: subtotal, shippingCents: shipping, taxCents, discountCents, totalCents, couponApplied };
}

export function findCart({ cartToken, userId }){
  if(userId){
    const userCart = Carts.first(c => c.userId === userId);
    if(userCart) return userCart;
    // Items may have been added to a guest cart before login — fall back to it.
    if(cartToken) return Carts.first(c => c.token === cartToken && !c.userId);
    return null;
  }
  if(cartToken) return Carts.first(c => c.token === cartToken && !c.userId);
  return null;
}

export function ensureCart({ cartToken, userId, res }){
  const existing = findCart({ cartToken, userId });
  if(existing) return existing;
  const token = userId ? null : (cartToken || id('cart'));
  const cart = Carts.insert({ id: id('crt'), token, userId: userId || null, items: [], createdAt: nowIso(), updatedAt: nowIso() });
  if(!userId && res){
    res.cookie(CART_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/api/v1', maxAge: 30 * 86_400_000 });
  }
  return cart;
}

export function setItem(cart, sku, qty){
  const variant = variantBySku(sku);
  if(!variant) fail(404, 'NOT_FOUND', 'That size and colorway combination does not exist.');
  if(qty > 0 && qty > availableOf(variant)){
    fail(409, 'OUT_OF_STOCK', `Only ${availableOf(variant)} left of that piece.`, { sku, available: availableOf(variant) });
  }
  const items = cart.items.filter(it => it.sku !== sku);
  if(qty > 0) items.push({ sku, qty });
  Carts.update(cart.id, { items, updatedAt: nowIso() });
  return serialize(Carts.get(cart.id));
}

export function serialize(cart){
  const items = (cart?.items || []).map(it => {
    const v = variantBySku(it.sku);
    return {
      sku: it.sku, qty: it.qty,
      product: v ? { id: v.productId, name: v.productName, colorway: v.colorway, size: v.size, unitPriceCents: v.priceCents } : null,
      lineTotalCents: v ? v.priceCents * it.qty : 0
    };
  });
  const t = totalsFor(cart?.items || [], cart?.couponCode);
  return {
    id: cart?.id || null,
    itemCount: items.reduce((a, i) => a + i.qty, 0),
    items,
    couponCode: cart?.couponCode || null,
    coupon: t.couponApplied,
    subtotalCents: t.subtotalCents,
    discountCents: t.discountCents,
    shippingCents: t.shippingCents,
    taxCents: t.taxCents,
    totalCents: t.totalCents,
    freeShippingOverCents: FREE_SHIPPING_OVER
  };
}

export function applyCoupon(cart, code){
  const upper = (code || '').toUpperCase().trim();
  if(!upper) fail(422, 'VALIDATION_ERROR', 'A coupon code is required.');
  const coupon = Coupons.first(c => c.code === upper && c.active);
  if(!coupon) fail(404, 'NOT_FOUND', 'That coupon code is not valid.');
  if(coupon.expiresAt && new Date(coupon.expiresAt) < new Date()){
    fail(410, 'GONE', 'This coupon has expired.');
  }
  if(coupon.maxUses && coupon.usedCount >= coupon.maxUses){
    fail(410, 'GONE', 'This coupon has reached its usage limit.');
  }
  Carts.update(cart.id, { couponCode: upper, updatedAt: nowIso() });
  return serialize(Carts.get(cart.id));
}

export function removeCoupon(cart){
  if(!cart?.couponCode) return serialize(cart);
  Carts.update(cart.id, { couponCode: null, updatedAt: nowIso() });
  return serialize(Carts.get(cart.id));
}

// Called after login: fold the guest cart into the account cart.
export function mergeCarts({ guestToken, userId }){
  const guest = guestToken ? Carts.first(c => c.token === guestToken && !c.userId) : null;
  const userCart = Carts.first(c => c.userId === userId);
  if(!guest || !guest.items.length) return serialize(userCart);
  const target = userCart || Carts.insert({ id: id('crt'), token: null, userId, items: [], createdAt: nowIso(), updatedAt: nowIso() });
  const merged = [...target.items];
  for(const it of guest.items){
    const existing = merged.find(m => m.sku === it.sku);
    if(existing) existing.qty = Math.min(10, existing.qty + it.qty);
    else merged.push({ sku: it.sku, qty: Math.min(10, it.qty) });
  }
  if(guest.id !== target.id) Carts.remove(guest.id);
  Carts.update(target.id, { items: merged, updatedAt: nowIso() });
  return serialize(Carts.get(target.id));
}

export function clearCart(cart){
  if(cart) Carts.update(cart.id, { items: [], updatedAt: nowIso() });
}
