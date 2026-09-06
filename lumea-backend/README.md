
# LUMÉA Backend — the engine behind the silk

Node ≥ 18.17 · Express 4 · ESM · **zero native dependencies** — installs and runs
on any machine. Persistence is a JSON document store with atomic writes, sitting
behind a repository boundary so Postgres/SQLite can replace it later without
touching a single service.

## Quickstart

    npm install
    cp .env.example .env
    npm run seed          # 6 products · 336 SKUs · 10 reviews
    npm run admin         # create your admin account (interactive)
    npm run dev           # API on http://localhost:8787
    npm run worker        # second terminal — sends queued emails

## Verify the whole thing

    npm run smoke         # 15 end-to-end checks against a running server

Set ADMIN_EMAIL + ADMIN_PASSWORD in the environment to include admin checks.

## Payments

* **Sandbox mode (default):** POST /checkout/session returns a confirmToken;
  POST /checkout/confirm settles the order. No keys, no network.
* **Stripe mode:** set STRIPE_SECRET_KEY (+ STRIPE_WEBHOOK_SECRET), run
  `npm i stripe`, point a webhook at POST /api/v1/webhooks/stripe. Signature
  verification is built in. The mode is reported by GET /api/v1/meta.

## Serve the frontend from the API (optional)

    STATIC_DIR=../ npm start

## Layout

    src/routes        HTTP layer + zod schemas
    src/services      business rules (reservations, fit engine, outbox…)
    src/repositories  persistence boundary over lib/db
    src/lib           db engine, errors, ids, logger
    src/middleware    auth (JWT), rate limits, error mapping
    src/jobs          reservation sweeper, mailer worker
    scripts           seed, create-admin, smoke tests
    docs/             ARCHITECTURE.md · API.md

Deep dives: `docs/ARCHITECTURE.md` (layers, inventory model, security) and
`docs/API.md` (every endpoint with examples).

## Production path

1. Swap `src/repositories/index.js` for Postgres implementations (same methods).
2. Swap `deliver()` in `src/services/mailer.js` for SMTP / Resend / Postmark.
3. Set a real JWT_SECRET, tight CORS_ORIGINS, NODE_ENV=production, run behind TLS.
