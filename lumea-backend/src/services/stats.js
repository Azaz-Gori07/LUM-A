
import { Orders, Users, Reviews, Variants, Subscribers } from '../repositories/index.js';
import { availableOf } from './catalog.js';

const REVENUE_STATUSES = ['paid', 'packed', 'shipped', 'delivered'];

export function adminStats(){
  const paid = Orders.find(o => REVENUE_STATUSES.includes(o.status));
  const revenueCents = paid.reduce((a, o) => a + o.totalCents, 0);
  const unitsSold = paid.reduce((a, o) => a + o.items.reduce((b, i) => b + i.qty, 0), 0);

  const byProduct = {};
  for(const o of paid) for(const it of o.items){
    byProduct[it.productName] = (byProduct[it.productName] || 0) + it.qty;
  }
  const topProducts = Object.entries(byProduct)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  return {
    orders: {
      total: Orders.count(),
      paid: paid.length,
      pending: Orders.count(o => o.status === 'pending'),
      cancelled: Orders.count(o => o.status === 'cancelled')
    },
    revenueCents,
    unitsSold,
    customers: Users.count(u => u.role === 'customer'),
    subscribers: Subscribers.count(),
    reviews: { total: Reviews.count(), pending: Reviews.count(r => r.status === 'pending') },
    lowStock: Variants.find(v => availableOf(v) <= 5)
      .map(v => ({ sku: v.sku, product: v.productName, colorway: v.colorway, size: v.size, available: availableOf(v) })),
    topProducts,
    recentOrders: Orders.all()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5)
      .map(o => ({ orderNumber: o.orderNumber, status: o.status, totalCents: o.totalCents, createdAt: o.createdAt }))
  };
}
