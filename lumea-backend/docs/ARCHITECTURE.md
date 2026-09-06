
# LUMÉA — Backend Architecture

## Stack

Express 4 · Node ≥ 18.17 · ESM · **zero native dependencies**.
Persistence: JSON document store (atomic tmp+rename writes) behind a repository
boundary — swap to Postgres later without touching services.

## Layers

    client
      │ fetch (credentials: include)
      ▼
    routes           HTTP, zod validation, status codes
      ▼
    services         business rules: reservations, fit engine, sessions, outbox
      ▼
    repositories     persistence boundary (all/find/first/get/count/insert/update/remove)
      ▼
    lib/db           JSON store: one file per collection, write-through
      ▼
    data/*.json      human-readable, gitignored

Cross-cutting: `middleware/` (auth, rate limits, error mapping) and `jobs/`
(reservation sweeper every 60 s, mailer worker every 4 s).

## Request lifecycle — checkout

1. `POST /api/v1/checkout/session` — zod validates, cart is snapshot, stock checked.
2. Order row created with status `pending`; inventory moves `stock → reserved`
   with a TTL (`RESERVATION_MINUTES`, default 15).
3. Payment: sandbox returns an HMAC `confirmToken`; stripe returns a
   PaymentIntent `clientSecret` (key absent → sandbox automatically).
4. Settlement (`/checkout/confirm` or the signed webhook) flips `reserved → sold`,
   status → `paid`, and enqueues the confirmation email into the outbox.
5. The sweeper releases any reservation whose TTL passed — no overselling, ever.

## Data model

| Collection | Purpose |
|---|---|
| `users` | id, email (unique), passwordHash (bcrypt-10), name, role |
| `refresh_tokens` | SHA-256 hashes, rotation, expiry, reuse detection |
| `products` | id, name, construction, priceCents, colorways, sizes, active |
| `variants` | inventory row per SKU: `available = stock − reserved` |
| `carts` | per-user or guest-token item lists |
| `orders` | immutable item snapshots, totals, timeline, address, payment |
| `reviews` | public writes land as `pending` (moderation queue) |
| `subscribers` | unique emails + source |
| `outbox` | queued emails: status, attempts, sentAt |
| `audit_log` | every admin mutation, who and what |
| `counters` | order-number sequence |

## Security

- bcrypt(10) password hashing; JWT access tokens (15 min).
- Refresh tokens: random 48-byte values, stored **hashed**, sent as httpOnly
  cookies scoped to `/api/v1/auth`, rotated on every use. Replaying a rotated
  token revokes every session for that user.
- zod validation on every write; helmet; CORS allowlist (dev escape for
  `file://` origins); rate limits (API / auth / public writes).
- Payments: no keys in code. Sandbox default; Stripe activates only when
  `STRIPE_SECRET_KEY` exists; webhook signatures verified with
  `crypto.timingSafeEqual`.
- Admin mutations are recorded in `audit_log`.

## Production path

1. **Database** — reimplement `src/repositories/index.js` against Postgres;
   services never learn the difference.
2. **Email** — replace `deliver()` in `src/services/mailer.js` with
   SMTP/Resend/Postmark; the outbox pattern already handles retries.
3. **Ops** — real `JWT_SECRET`, tight `CORS_ORIGINS`, `NODE_ENV=production`,
   TLS terminating proxy, horizontal scale only after the DB swap (the JSON
   store is single-process by design).
