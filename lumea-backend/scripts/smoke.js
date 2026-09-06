
const BASE = process.env.BASE_URL || 'http://localhost:8787';
let passed = 0, failed = 0;

async function call(method, path, { body, token, cookie } = {}){
  const headers = { 'content-type': 'application/json' };
  if(token) headers.authorization = `Bearer ${token}`;
  if(cookie) headers.cookie = cookie;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const setCookies = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, setCookies };
}

function check(name, ok){
  if(ok){ passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}`); }
}

async function main(){
  console.log(`LUMÉA smoke test → ${BASE}\n`);

  const health = await call('GET', '/health');
  check('GET /health', health.status === 200 && health.json.ok);

  const meta = await call('GET', '/api/v1/meta');
  check('GET /api/v1/meta', meta.status === 200 && meta.json.payments);

  const products = await call('GET', '/api/v1/products');
  check('GET /api/v1/products', products.status === 200 && products.json.items.length >= 6);

  const detail = await call('GET', '/api/v1/products/aerin');
  const sku = detail.json.product?.variants?.[0]?.sku;
  check('GET /api/v1/products/aerin', detail.status === 200 && !!sku);

  const fit = await call('POST', '/api/v1/fit/size', { body: { band: 34, cup: 'C' } });
  check('POST /api/v1/fit/size', fit.status === 200 && fit.json.size === '34C' && Array.isArray(fit.json.sisters));

  const put = await call('PUT', '/api/v1/cart/items', { body: { sku, qty: 1 } });
  const cartCookie = (put.setCookies[0] || '').split(';')[0];
  check('PUT /api/v1/cart/items', put.status === 200 && put.json.itemCount === 1);

  const cart = await call('GET', '/api/v1/cart', { cookie: cartCookie });
  check('GET /api/v1/cart', cart.status === 200 && cart.json.itemCount === 1);

  const email = `smoke_${Date.now()}@lumea.test`;
  const reg = await call('POST', '/api/v1/auth/register', { body: { email, password: 'silk-skin-01', name: 'Smoke Test' } });
  check('POST /auth/register', reg.status === 201 && !!reg.json.accessToken);

  const login = await call('POST', '/api/v1/auth/login', { body: { email, password: 'silk-skin-01' } });
  const refreshCookie = (login.setCookies[0] || '').split(';')[0];
  check('POST /auth/login', login.status === 200 && !!login.json.accessToken);

  const me = await call('GET', '/api/v1/auth/me', { token: login.json.accessToken });
  check('GET /auth/me', me.status === 200 && me.json.user.email === email);

  const refreshed = await call('POST', '/api/v1/auth/refresh', { cookie: refreshCookie });
  check('POST /auth/refresh (rotation)', refreshed.status === 200 && !!refreshed.json.accessToken);

  const session = await call('POST', '/api/v1/checkout/session', {
    cookie: cartCookie, token: login.json.accessToken,
    body: { email, address: { line1: '12 Rue de la Soie', city: 'Paris', postal: '75003', country: 'France' } }
  });
  check('POST /checkout/session (reserves stock)', session.status === 201 && !!session.json.confirmToken);

  const confirm = await call('POST', '/api/v1/checkout/confirm', {
    body: { orderNumber: session.json.order.orderNumber, confirmToken: session.json.confirmToken }
  });
  check('POST /checkout/confirm (settles)', confirm.status === 200 && confirm.json.order.status === 'paid');

  const orders = await call('GET', '/api/v1/orders', { token: login.json.accessToken });
  check('GET /orders', orders.status === 200 && orders.json.orders.length === 1);

  const review = await call('POST', '/api/v1/reviews', {
    body: { productId: 'aerin', name: 'Smoke', size: '34C', rating: 5, quote: 'The smoke test approves of this silk.' }
  });
  check('POST /reviews (moderation queue)', review.status === 202 && review.json.review.status === 'pending');

  if(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD){
    const adminLogin = await call('POST', '/api/v1/auth/login', {
      body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }
    });
    if(adminLogin.status === 200){
      const token = adminLogin.json.accessToken;
      const stats = await call('GET', '/api/v1/admin/stats', { token });
      check('GET /admin/stats', stats.status === 200 && !!stats.json.orders);
      const inv = await call('POST', '/api/v1/admin/inventory/adjust', { token, body: { sku, set: 12 } });
      check('POST /admin/inventory/adjust', inv.status === 200 && inv.json.variant.stock === 12);
      const outbox = await call('GET', '/api/v1/admin/outbox', { token });
      check('GET /admin/outbox', outbox.status === 200 && Array.isArray(outbox.json.messages));
    } else {
      console.log('· admin login failed — skipping admin checks');
    }
  } else {
    console.log('· set ADMIN_EMAIL + ADMIN_PASSWORD to include admin checks');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch(err => { console.error('smoke: fatal —', err.message); process.exit(1); });
