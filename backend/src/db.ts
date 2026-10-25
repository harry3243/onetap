import 'dotenv/config'; import pg from 'pg';
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const q = (t: string, p: any[] = []) => pool.query(t, p).then(r => r.rows);
