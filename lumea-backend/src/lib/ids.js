
import crypto from 'node:crypto';
import { collection } from './db.js';

export const nowIso = () => new Date().toISOString();

export function id(prefix){
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(5).toString('hex')}`;
}

export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

export const hmac = (secret, value) => crypto.createHmac('sha256', secret).update(value).digest('hex');

export const randomToken = (bytes = 48) => crypto.randomBytes(bytes).toString('hex');

export function nextOrderNumber(){
  const counters = collection('counters');
  const row = counters.first(c => c.id === 'orders') || counters.insert({ id: 'orders', seq: 0 });
  counters.update('orders', { seq: row.seq + 1 });
  const yy = String(new Date().getFullYear()).slice(-2);
  return `LUM-${yy}-${String(row.seq + 1).padStart(4, '0')}`;
}
