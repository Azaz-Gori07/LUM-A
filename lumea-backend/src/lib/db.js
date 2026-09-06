
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { logger } from './logger.js';

// JSON document store: one file per collection, loaded once into memory,
// persisted with atomic tmp-file + rename writes. Single-process by design —
// swap the repositories layer for Postgres to scale horizontally.

const dataDir = path.resolve(process.cwd(), env.dataDir);
fs.mkdirSync(dataDir, { recursive: true });

const stores = new Map();

function writeAtomic(file, data){
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, data, 'utf8');
  try{
    fs.renameSync(tmp, file);
  }catch{
    // Windows: rename fails if the target is open — fall back to copy+delete.
    fs.copyFileSync(tmp, file);
    fs.unlinkSync(tmp);
  }
}

export function collection(name){
  if(stores.has(name)) return stores.get(name);
  const file = path.join(dataDir, `${name}.json`);
  let rows = [];
  if(fs.existsSync(file)){
    try{ rows = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch(err){ logger.error(`db: could not parse ${file} — starting empty (${err.message})`); }
  }
  const persist = () => writeAtomic(file, JSON.stringify(rows, null, 2));

  const api = {
    get name(){ return name; },
    all: () => rows.slice(),
    find: fn => rows.filter(fn),
    first: fn => rows.find(fn) || null,
    get: id => rows.find(r => r.id === id) || null,
    count: (fn) => rows.filter(fn || (() => true)).length,
    insert(doc){ rows.push(doc); persist(); return doc; },
    update(id, patch){
      const row = rows.find(r => r.id === id);
      if(!row) return null;
      const changes = typeof patch === 'function' ? patch(row) : patch;
      Object.assign(row, changes || {});
      persist();
      return row;
    },
    remove(id){
      const i = rows.findIndex(r => r.id === id);
      if(i < 0) return false;
      rows.splice(i, 1);
      persist();
      return true;
    },
    clear(){ rows = []; persist(); }
  };

  stores.set(name, api);
  logger.debug(`db: collection "${name}" ready (${rows.length} rows)`);
  return api;
}
