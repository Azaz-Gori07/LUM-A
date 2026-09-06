
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const denied = message => ({ error: { code: 'RATE_LIMITED', message } });

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.rateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: denied('Too many requests — take a breath and try again shortly.')
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.authRateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: denied('Too many attempts from this address. Try again in a few minutes.')
});

export const writeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: denied('A little too enthusiastic — try again in an hour.')
});
