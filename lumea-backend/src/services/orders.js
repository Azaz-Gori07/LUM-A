
import { Orders, Variants } from '../repositories/index.js';
import { fail } from '../lib/errors.js';
import { nowIso } from '../lib/ids.js';
import * as mailer from './mailer.js';
import { refundOrder } from './checkout.js';

const TRANSITIONS = {
  pending:  ['cancelled'],
  paid:     ['packed', 'cancelled'],
  packed:   ['shipped'],
  shipped:  ['delivered'],
  delivered: [],
  cancelled: []
};

const brief = o => ({
  orderNumber: o.orderNumber, status: o.status, email: o.email,
  subtotalCents: o.subtotalCents, discountCents: o.discountCents || 0,
  shippingCents: o.shippingCents, taxCents: o.taxCents || 0,
  totalCents: o.totalCents, couponCode: o.couponCode || null,
  itemCount: o.items.reduce((a, i) => a + i.qty, 0), createdAt: o.createdAt
});

export function listForUser(userId){
  return Orders.find(o => o.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(brief);
}

export function adminList({ status } = {}){
  const rows = status ? Orders.find(o => o.status === status) : Orders.all();
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(brief);
}

export function getByNumber(orderNumber){
  return Orders.first(o => o.orderNumber === orderNumber) || null;
}

export async function updateStatus(order, status, note){
  const allowed = TRANSITIONS[order.status] || [];
  if(!allowed.includes(status)){
    fail(409, 'CONFLICT', `An order can't move from "${order.status}" to "${status}".`);
  }
  if(status === 'cancelled'){
    for(const it of order.items){
      Variants.update(it.sku, v => order.status === 'pending'
        ? { reserved: Math.max(0, (v.reserved || 0) - it.qty) }
        : { stock: v.stock + it.qty });
    }
    // Refund via Stripe if the order was paid.
    if(order.status === 'paid'){
      const refundId = await refundOrder(order);
      if(refundId){
        Orders.update(order.id, {
          payment: { ...order.payment, refundId },
          timeline: [...Orders.get(order.id).timeline, { at: nowIso(), event: 'refunded', note: `Stripe refund ${refundId}.` }],
        });
      }
    }
  }
  Orders.update(order.id, {
    status,
    timeline: [...Orders.get(order.id).timeline, { at: nowIso(), event: status, note: note || '' }],
    updatedAt: nowIso()
  });
  const fresh = Orders.get(order.id);
  if(status === 'shipped') mailer.enqueueShippingNotice(fresh);
  return fresh;
}
