
import readline from 'node:readline/promises';
import bcrypt from 'bcryptjs';
import { Users } from '../src/repositories/index.js';
import { id, nowIso } from '../src/lib/ids.js';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const email = (await rl.question('Admin email: ')).trim().toLowerCase();
const password = await rl.question('Admin password (min 8 chars): ');
rl.close();

if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 8){
  console.error('A valid email and a password of at least 8 characters are required.');
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 10);
const existing = Users.first(u => u.email === email);
if(existing){
  Users.update(existing.id, { role: 'admin', passwordHash, failedAttempts: 0, lockedUntil: null });
  console.log(`[ok] ${email} promoted to admin`);
} else {
  Users.insert({ id: id('usr'), email, name: 'Atelier Admin', role: 'admin', passwordHash, failedAttempts: 0, lockedUntil: null, createdAt: nowIso() });
  console.log(`[ok] admin ${email} created`);
}
