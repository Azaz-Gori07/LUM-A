
# LUMÉA — API Reference

Base URL: `http://localhost:8787` · All data routes live under `/api/v1`.
Success responses are JSON; errors always look like:

    { "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [...] } }

## Auth

    POST /api/v1/auth/register     { email, password, name }
    POST /api/v1/auth/login        { email, password }
    POST /api/v1/auth/refresh      (httpOnly cookie — rotates the token)
    POST /api/v1/auth/logout       (revokes the refresh token)
    GET  /api/v1/auth/me           (Bearer token)

Register/login return `{ accessToken, user }`. Keep the access token in memory,
send it as `Authorization: Bearer …`, and call `/auth/refresh` when it expires —
the browser refresh cookie does the rest.

## Catalog & fit

    GET  /api/v1/products?construction=bonded|lace|knit|silk
    GET  /api/v1/products/:id          → includes per-SKU availability
    GET  /api/v1/fit/sizes             → { bands, cups }
    POST /api/v1/fit/size              { band: 34, cup: "C" }
       → { size, sisters[], recommendation{productId, scale, reason} }

## Cart (guest or user — cookie carries the guest cart)

    GET    /api/v1/cart
    PUT    /api/v1/cart/items          { sku, qty }   (qty 0 removes)
    DELETE /api/v1/cart
    POST   /api/v1/cart/merge          (auth — folds guest cart into account)

SKU format: `{productId}-{colorway}-{size}` e.g. `aerin-porcelain-34C`.

## Checkout & orders

    POST /api/v1/checkout/session      { email, address{...} }
       → 201 { order, clientSecret?, confirmToken? }
    POST /api/v1/checkout/confirm      { orderNumber, confirmToken }   (sandbox)
    POST /api/v1/webhooks/stripe       (signature-verified, stripe mode)
    GET  /api/v1/orders                (auth)
    GET  /api/v1/orders/:orderNumber   (owner or admin)
    POST /api/v1/orders/:orderNumber/cancel

Status flow: `pending → paid → packed → shipped → delivered`, with `cancelled`
reachable from pending/paid (stock is released or restocked).

## Voices & newsletter

    GET  /api/v1/reviews?productId=&page=&limit=   → published + summary
    POST /api/v1/reviews   { productId, name, size, rating, quote }  → 202, queued
    POST /api/v1/newsletter { email, source? }

## Admin (role: admin)

    GET   /api/v1/admin/stats
    GET   /api/v1/admin/orders?status=
    PATCH /api/v1/admin/orders/:orderNumber/status   { status, note? }
    GET   /api/v1/admin/reviews?status=
    PATCH /api/v1/admin/reviews/:id/status           { status }
    DELETE /api/v1/admin/reviews/:id
    PATCH /api/v1/admin/products/:id                 { priceCents?, active?, description? }
    POST  /api/v1/admin/inventory/adjust             { sku, set? | delta? }
    GET   /api/v1/admin/outbox
    POST  /api/v1/admin/outbox/:id/resend
    GET   /api/v1/admin/audit

## Wiring the LUMÉA frontend

Call the API with cookies so guest carts and refresh tokens survive:

    const API = 'http://localhost:8787/api/v1';
    const res = await fetch(`${API}/products`, { credentials: 'include' });
    const { products } = await res.json();

Add the frontend origin to `CORS_ORIGINS` in `.env`. The natural swaps for the
existing pages: the Fit Room calls `/fit/size`, the shop calls `/products`, the
bag calls `/cart/items`, reviews come from `/reviews`, and the newsletter form
posts to `/newsletter`.

## Try it with curl

    curl -s localhost:8787/api/v1/products | head -c 400
    curl -s -X POST localhost:8787/api/v1/fit/size \
      -H 'content-type: application/json' -d '{"band":34,"cup":"C"}'
    curl -s -c jar.txt -X PUT localhost:8787/api/v1/cart/items \
      -H 'content-type: application/json' \
      -d '{"sku":"aerin-porcelain-34C","qty":1}'
