
import { Outbox } from '../repositories/index.js';
import { id, nowIso } from '../lib/ids.js';
import { logger } from '../lib/logger.js';
import { usd } from '../lib/money.js';

// Outbox pattern: business logic only enqueues. The worker (src/jobs/worker.js)
// delivers asynchronously — a crashed send never loses an email, and retries
// are trivial. Swap deliver() for SMTP/Resend/Postmark in production.

export function enqueue({ to, subject, text, html }){
  return Outbox.insert({
    id: id('msg'), to, subject, text, html: html || null,
    status: 'queued', attempts: 0, createdAt: nowIso(), sentAt: null
  });
}

// Escape HTML entities to prevent injection in email templates.
function esc(str){
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const wrap = (title, body) => `<div style="font-family:Georgia,serif;background:#F4EEE4;padding:32px"><div style="max-width:520px;margin:0 auto;background:#FDF9F2;border:1px solid #D8CABA;padding:32px"><p style="letter-spacing:.3em;font-size:11px;color:#6E5F52;margin:0 0 24px">L U M &Eacute; A</p><h1 style="font-size:22px;font-weight:400;color:#241B15;margin:0 0 16px">${esc(title)}</h1>${body}<p style="font-size:11px;color:#A89684;margin:32px 0 0;border-top:1px solid #D8CABA;padding-top:16px">LUM&Eacute;A Atelier &middot; Second-skin intimates &middot; Automated note from the prototype backend.</p></div></div>`;

const row = (label, value) => `<tr><td style="padding:6px 12px 6px 0;color:#6E5F52;font-size:12px">${label}</td><td style="padding:6px 0;color:#241B15;font-size:14px">${value}</td></tr>`;

export function enqueueOrderConfirmation(order){
  const rows = order.items.map(it =>
    row(`${esc(it.productName)} — ${esc(it.colorway)} · ${esc(it.size)} × ${it.qty}`, usd(it.lineTotalCents))).join('');
  enqueue({
    to: order.email,
    subject: `LUMÉA — order ${esc(order.orderNumber)} is confirmed`,
    text: `Thank you. Order ${order.orderNumber} is confirmed. Total ${usd(order.totalCents)}. Sixty-day fit guarantee included.`,
    html: wrap("It's yours.", `<p style="color:#6E5F52;font-size:14px">Order <strong>${esc(order.orderNumber)}</strong> is confirmed and reserved under your name.</p><table style="border-collapse:collapse;margin:16px 0">${rows}${row('Shipping', usd(order.shippingCents))}${row('Total', `<strong>${usd(order.totalCents)}</strong>`)}</table><p style="color:#6E5F52;font-size:13px">Sixty days to change your mind. Repairs for life, always.</p>`)
  });
}

export function enqueueShippingNotice(order){
  const city = order.address?.city ? ` to ${esc(order.address.city)}` : '';
  enqueue({
    to: order.email,
    subject: `LUMÉA — order ${esc(order.orderNumber)} has left the atelier`,
    text: `Your order ${order.orderNumber} is on its way${order.address?.city ? ' to ' + order.address.city : ''}. Carbon-neutral shipping, as always.`,
    html: wrap('Left the atelier.', `<p style="color:#6E5F52;font-size:14px">Order <strong>${esc(order.orderNumber)}</strong> is on its way${city}. Carbon-neutral shipping, as always.</p>`)
  });
}

export function enqueueNewsletterWelcome(email){
  enqueue({
    to: email,
    subject: 'LUMÉA — first access, as promised',
    text: "You're in. First access lands before the next drop.",
    html: wrap("You're in.", '<p style="color:#6E5F52;font-size:14px">First access to the Skin Series lands in your inbox before the next drop.</p>')
  });
}

export function enqueuePasswordReset(email, token){
  const resetUrl = `${env.publicBaseUrl}/reset-password?token=${token}`;
  enqueue({
    to: email,
    subject: 'LUMÉA — password reset',
    text: `Use this link to reset your password: ${resetUrl} — valid for 1 hour.`,
    html: wrap('Reset your password.', `<p style="color:#6E5F52;font-size:14px">Click the button below to set a new password. This link expires in one hour.</p><p style="margin:24px 0"><a href="${esc(resetUrl)}" style="display:inline-block;background:#241B15;color:#F4EEE4;padding:12px 32px;text-decoration:none;border-radius:999px;font-size:13px;letter-spacing:.1em">RESET PASSWORD</a></p><p style="color:#A89684;font-size:12px">If you did not request this, you can safely ignore this email.</p>`)
  });
}

export async function deliver(doc){
  logger.info(`mailer → to=${doc.to} subject="${doc.subject}"`);
  Outbox.update(doc.id, { status: 'sent', sentAt: nowIso(), attempts: (doc.attempts || 0) + 1 });
}

export async function processQueue(){
  const queued = Outbox.find(m => m.status === 'queued');
  for(const doc of queued){ await deliver(doc); }
  return queued.length;
}
