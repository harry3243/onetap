import fs from 'fs'; import { pool } from './db.js';
const dir = new URL('../migrations/', import.meta.url);
for (const f of fs.readdirSync(dir).sort()) { await pool.query(fs.readFileSync(new URL(f, dir), 'utf8')); console.log('applied', f); }
await pool.end();
