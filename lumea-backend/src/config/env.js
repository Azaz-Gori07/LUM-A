import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Tiny zero-dependency .env loader (does not override real environment variables).
(function(){
  try{
    const file = path.resolve(process.cwd(), '.env');
    if(!fs.existsSync(file)) return;
    for(const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)){
      if(line.trim().startsWith('#')) continue;
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if(!m) continue;
      let val = m[2];
      if((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if(!(m[1] in process.env)) process.env[m[1]] = val;
    }
  }catch(_){ /* a missing .env is fine */ }
})();

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
const isProd = process.env.NODE_ENV === 'production';

let jwtSecret = process.env.JWT_SECRET || '';
if(!jwtSecret){
  if(isProd){ console.error('FATAL: JWT_SECRET is required in production.'); process.exit(1); }
  // Generate a random dev secret on first run and persist it so tokens survive restarts.
  const secretFile = path.resolve(process.cwd(), 'data', '.jwt-dev-secret');
  try{
    if(fs.existsSync(secretFile)){
      jwtSecret = fs.readFileSync(secretFile, 'utf8').trim();
    } else {
      jwtSecret = crypto.randomBytes(32).toString('hex');
      fs.mkdirSync(path.dirname(secretFile), { recursive: true });
      fs.writeFileSync(secretFile, jwtSecret, 'utf8');
    }
  }catch{
    jwtSecret = crypto.randomBytes(32).toString('hex');
  }
  console.warn('[lumea] JWT_SECRET not set — generated a random dev secret (persisted in data/.jwt-dev-secret).');
}

export const env = Object.freeze({
  isProd,
  port: num(process.env.PORT, 8787),
  dataDir: process.env.DATA_DIR || './data',
  jwtSecret,
  accessMinutes: num(process.env.ACCESS_TOKEN_MINUTES, 15),
  refreshDays: num(process.env.REFRESH_TOKEN_DAYS, 30),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500')
    .split(',').map(s => s.trim()).filter(Boolean),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:5500',
  reservationMs: num(process.env.RESERVATION_MINUTES, 15) * 60_000,
  rateLimitMax: num(process.env.RATE_LIMIT_MAX, 400),
  authRateLimitMax: num(process.env.AUTH_RATE_LIMIT_MAX, 20),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  staticDir: process.env.STATIC_DIR || '',
  taxRate: num(process.env.TAX_RATE, 0)  // e.g. 0.08 for 8%
});
