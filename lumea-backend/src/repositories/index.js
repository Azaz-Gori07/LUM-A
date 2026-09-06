
import { collection } from '../lib/db.js';

// The persistence boundary. Every service talks to these collections only.
// To move to Postgres/SQLite, reimplement these methods (all, find, first,
// get, count, insert, update, remove, clear) against SQL — nothing above
// this layer needs to change.

export const Users         = collection('users');
export const Tokens        = collection('refresh_tokens');
export const PasswordResets = collection('password_resets');
export const Products      = collection('products');
export const Variants      = collection('variants');      // inventory: one row per SKU
export const Carts         = collection('carts');
export const Orders        = collection('orders');
export const Reviews       = collection('reviews');
export const Coupons       = collection('coupons');
export const Subscribers   = collection('subscribers');
export const Outbox        = collection('outbox');
export const Audit         = collection('audit_log');
