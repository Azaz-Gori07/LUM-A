
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Users } from '../repositories/index.js';
import { fail, ah } from '../lib/errors.js';

function readBearer(req){
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function currentUser(req){
  const token = readBearer(req);
  if(!token) return null;
  try{
    const payload = jwt.verify(token, env.jwtSecret);
    const user = Users.get(payload.sub);
    return user ? { id: user.id, email: user.email, name: user.name, role: user.role } : null;
  }catch(_){ return null; }
}

export const requireAuth = ah((req, res, next) => {
  const token = readBearer(req);
  if(!token) fail(401, 'UNAUTHORIZED', 'Sign in to continue — a Bearer access token is required.');
  let payload;
  try{ payload = jwt.verify(token, env.jwtSecret); }
  catch{ fail(401, 'UNAUTHORIZED', 'Access token is invalid or has expired.'); }
  const user = Users.get(payload.sub);
  if(!user) fail(401, 'UNAUTHORIZED', 'This account no longer exists.');
  req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
  next();
});

export const requireAdmin = ah((req, res, next) => {
  if(!req.user) fail(401, 'UNAUTHORIZED', 'Sign in first.');
  if(req.user.role !== 'admin') fail(403, 'FORBIDDEN', 'Admin privileges required.');
  next();
});

// Attaches req.user when a valid token is present; never rejects.
export const optionalAuth = ah((req, res, next) => {
  const user = currentUser(req);
  if(user) req.user = user;
  next();
});
