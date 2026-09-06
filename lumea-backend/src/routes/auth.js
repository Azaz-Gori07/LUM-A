
import { Router } from 'express';
import { z } from 'zod';
import { parse, fail, ah } from '../lib/errors.js';
import * as authService from '../services/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rate-limit.js';

const router = Router();

const Password = z.string().min(8, 'At least 8 characters.').max(200);
const Email = z.string().email('A valid email is required.').max(160);

router.post('/register', authLimiter, ah(async (req, res) => {
  const body = parse(z.object({ email: Email, password: Password, name: z.string().min(1, 'A name is required.').max(80) }), req.body);
  const user = await authService.register(body);
  res.status(201).json(authService.issueSession(res, user));
}));

router.post('/login', authLimiter, ah(async (req, res) => {
  const body = parse(z.object({ email: Email, password: z.string().min(1).max(200) }), req.body);
  const user = await authService.login(body);
  res.json(authService.issueSession(res, user));
}));

router.post('/refresh', authLimiter, ah((req, res) => {
  const token = req.cookies[authService.REFRESH_COOKIE];
  if(!token) fail(401, 'UNAUTHORIZED', 'No refresh token cookie present.');
  const { user, refreshToken } = authService.rotateRefresh(token);
  authService.setRefreshCookie(res, refreshToken);
  res.json({ accessToken: authService.signAccessToken(user), user: authService.sanitizeUser(user) });
}));

router.post('/logout', ah((req, res) => {
  authService.revokeRefresh(req.cookies[authService.REFRESH_COOKIE]);
  authService.clearRefreshCookie(res);
  res.json({ ok: true });
}));

router.get('/me', requireAuth, ah((req, res) => res.json({ user: req.user })));

router.put('/profile', requireAuth, ah(async (req, res) => {
  const body = parse(z.object({
    name: z.string().min(1).max(80).optional(),
    email: Email.optional()
  }), req.body);
  const user = await authService.updateProfile(req.user.id, body);
  res.json({ user });
}));

router.put('/password', requireAuth, ah(async (req, res) => {
  const body = parse(z.object({
    currentPassword: z.string().min(1),
    newPassword: Password
  }), req.body);
  const result = await authService.changePassword(req.user.id, body);
  authService.clearRefreshCookie(res); // force re-login
  res.json(result);
}));

router.post('/forgot-password', authLimiter, ah(async (req, res) => {
  const body = parse(z.object({ email: Email }), req.body);
  const result = await authService.requestPasswordReset(body.email);
  res.json(result);
}));

router.post('/reset-password', authLimiter, ah(async (req, res) => {
  const body = parse(z.object({
    token: z.string().min(16),
    newPassword: Password
  }), req.body);
  const result = await authService.resetPassword(body);
  res.json(result);
}));

export default router;
