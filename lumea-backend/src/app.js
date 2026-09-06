
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { env } from './config/env.js';
import apiRouter from './routes/index.js';
import { apiLimiter } from './middleware/rate-limit.js';
import { notFound, errorHandler } from './middleware/error.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-origin' } }));
app.use(morgan(env.isProd ? 'tiny' : 'dev'));
app.use(cors({ origin: allowOrigin, credentials: true }));
app.use(express.json({
  limit: '256kb',
  verify: (req, res, buf) => { req.rawBody = buf; } // needed for Stripe signature checks
}));
app.use(cookieParser());

app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime(), time: new Date().toISOString() }));

app.use('/api/v1', apiLimiter, apiRouter);

// Optional: host the static frontend from this process.
if(env.staticDir){
  const dir = path.resolve(process.cwd(), env.staticDir);
  if(fs.existsSync(dir)){
    app.use(express.static(dir));
    app.use((req, res, next) => {
      if(req.method !== 'GET' || req.path.startsWith('/api') || req.path === '/health') return next();
      const index = path.join(dir, 'index.html');
      if(fs.existsSync(index)) return res.sendFile(index);
      next();
    });
  }
}

app.use(notFound);
app.use(errorHandler);

function allowOrigin(origin, callback){
  if(!origin) return callback(null, true);                                  // same-origin / curl
  if(env.corsOrigins.includes(origin) || env.corsOrigins.includes('*')) return callback(null, true);
  // Removed: file:// origin bypass was a security risk in development.
  return callback(null, false);                                             // no CORS headers → browser blocks
}

export { app };
