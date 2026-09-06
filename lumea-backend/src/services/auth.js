
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Users, Tokens, PasswordResets } from '../repositories/index.js';
import { fail, stripHtml } from '../lib/errors.js';
import { id, sha256, randomToken, nowIso } from '../lib/ids.js';
import * as mailer from './mailer.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export const REFRESH_COOKIE = 'lumea_rt';

const sanitize = user => ({ id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt });

export function signAccessToken(user){
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, env.jwtSecret,
    { expiresIn: `${env.accessMinutes}m` });
}

function createRefresh(userId){
  const token = randomToken(48);
  Tokens.insert({
    id: id('tk'), userId,
    tokenHash: sha256(token), // refresh tokens are stored hashed, never in the clear
    expiresAt: new Date(Date.now() + env.refreshDays * 86_400_000).toISOString(),
    revokedAt: null, createdAt: nowIso()
  });
  return token;
}

export function setRefreshCookie(res, token){
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: env.isProd,
    path: '/api/v1/auth', maxAge: env.refreshDays * 86_400_000
  });
}

export function clearRefreshCookie(res){
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
}

export function issueSession(res, user){
  const refreshToken = createRefresh(user.id);
  setRefreshCookie(res, refreshToken);
  return { accessToken: signAccessToken(user), user: sanitize(user) };
}

export async function register({ email, password, name }){
  const normalized = email.trim().toLowerCase();
  if(Users.first(u => u.email === normalized)){
    fail(409, 'CONFLICT', 'An account already lives at this email. Try signing in instead.');
  }
  const passwordHash = await bcrypt.hash(password, 10);
  return Users.insert({
    id: id('usr'), email: normalized, name: stripHtml(name), role: 'customer',
    passwordHash, failedAttempts: 0, lockedUntil: null, createdAt: nowIso()
  });
}

export async function login({ email, password }){
  const normalized = email.trim().toLowerCase();
  const user = Users.first(u => u.email === normalized);
  if(!user) fail(401, 'UNAUTHORIZED', 'Email or password is incorrect.');

  // Account lockout check.
  if(user.lockedUntil && new Date(user.lockedUntil) > new Date()){
    fail(423, 'LOCKED', 'Too many failed attempts. Please try again later.');
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if(!ok){
    const attempts = (user.failedAttempts || 0) + 1;
    const update = { failedAttempts: attempts };
    if(attempts >= MAX_FAILED_ATTEMPTS){
      update.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString();
    }
    Users.update(user.id, update);
    fail(401, 'UNAUTHORIZED', 'Email or password is incorrect.');
  }

  // Clear failed attempts on successful login.
  if(user.failedAttempts > 0 || user.lockedUntil){
    Users.update(user.id, { failedAttempts: 0, lockedUntil: null });
  }
  return user;
}

export function rotateRefresh(token){
  const hash = sha256(String(token || ''));
  const row = Tokens.first(t => t.tokenHash === hash);
  if(!row) fail(401, 'UNAUTHORIZED', 'Refresh token is not recognised.');
  if(row.revokedAt){
    // A rotated token being replayed — assume theft, kill every session.
    Tokens.find(t => t.userId === row.userId).forEach(t => Tokens.update(t.id, { revokedAt: nowIso() }));
    fail(401, 'UNAUTHORIZED', 'Refresh token reuse detected — all sessions have been signed out.');
  }
  if(new Date(row.expiresAt) < new Date()) fail(401, 'UNAUTHORIZED', 'Refresh token has expired. Please sign in again.');
  const user = Users.get(row.userId);
  if(!user) fail(401, 'UNAUTHORIZED', 'This account no longer exists.');
  Tokens.update(row.id, { revokedAt: nowIso() });
  return { user, refreshToken: createRefresh(user.id) };
}

export function revokeRefresh(token){
  const hash = sha256(String(token || ''));
  const row = Tokens.first(t => t.tokenHash === hash);
  if(row) Tokens.update(row.id, { revokedAt: nowIso() });
}

// ── Profile management ────────────────────────────────────────────────

export async function updateProfile(userId, { name, email }){
  const user = Users.get(userId);
  if(!user) fail(404, 'NOT_FOUND', 'Account not found.');
  const changes = {};
  if(name !== undefined) changes.name = stripHtml(name);
  if(email !== undefined){
    const normalized = email.trim().toLowerCase();
    if(normalized !== user.email){
      if(Users.first(u => u.email === normalized)){
        fail(409, 'CONFLICT', 'Another account already uses this email.');
      }
      changes.email = normalized;
    }
  }
  if(Object.keys(changes).length === 0) return sanitize(Users.get(userId));
  return sanitize(Users.update(userId, changes));
}

export async function changePassword(userId, { currentPassword, newPassword }){
  const user = Users.get(userId);
  if(!user) fail(404, 'NOT_FOUND', 'Account not found.');
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if(!ok) fail(401, 'UNAUTHORIZED', 'Current password is incorrect.');
  const passwordHash = await bcrypt.hash(newPassword, 10);
  Users.update(userId, { passwordHash });
  // Revoke all existing sessions so the user must re-login.
  Tokens.find(t => t.userId === userId && !t.revokedAt)
    .forEach(t => Tokens.update(t.id, { revokedAt: nowIso() }));
  return { ok: true, note: 'Password updated. Please sign in again.' };
}

// ── Password reset ────────────────────────────────────────────────────

export async function requestPasswordReset(email){
  const normalized = email.trim().toLowerCase();
  const user = Users.first(u => u.email === normalized);
  // Always return success to prevent email enumeration.
  if(!user) return { ok: true, note: 'If an account exists, a reset link has been sent.' };
  // Invalidate any previous reset tokens for this user.
  PasswordResets.find(r => r.userId === user.id && !r.usedAt)
    .forEach(r => PasswordResets.update(r.id, { usedAt: nowIso() }));
  const token = randomToken(32);
  PasswordResets.insert({
    id: id('rst'), userId: user.id,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(), // 1 hour
    usedAt: null, createdAt: nowIso()
  });
  mailer.enqueuePasswordReset(user.email, token);
  return { ok: true, note: 'If an account exists, a reset link has been sent.' };
}

export async function resetPassword({ token, newPassword }){
  const hash = sha256(String(token || ''));
  const row = PasswordResets.first(r => r.tokenHash === hash && !r.usedAt);
  if(!row) fail(400, 'BAD_REQUEST', 'Invalid or expired reset token.');
  if(new Date(row.expiresAt) < new Date()) fail(400, 'BAD_REQUEST', 'Reset token has expired. Please request a new one.');
  PasswordResets.update(row.id, { usedAt: nowIso() });
  const passwordHash = await bcrypt.hash(newPassword, 10);
  Users.update(row.userId, { passwordHash });
  // Revoke all sessions for this user.
  Tokens.find(t => t.userId === row.userId && !t.revokedAt)
    .forEach(t => Tokens.update(t.id, { revokedAt: nowIso() }));
  return { ok: true, note: 'Password has been reset. Please sign in with your new password.' };
}

export { sanitize as sanitizeUser };
