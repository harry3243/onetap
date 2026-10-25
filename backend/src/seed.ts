import bcrypt from 'bcryptjs'; import { pool, q } from './db.js';
const cats: [string, string[]][] = [['Healthcare', ['Dental clinics', 'General physicians']], ['Personal Care', ['Salons', 'Spa services']], ['Education', ['Tutors']],
  ['Professional Services', ['Legal consultations']], ['Vehicle Services', ['Car servicing']], ['Home Services', ['Plumbing']], ['Fitness and Wellness', ['Personal trainers']], ['Other Services', []]];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '-');
if ((await q('SELECT 1 FROM users LIMIT 1')).length) { console.log('already seeded'); process.exit(0); }
for (const [n, kids] of cats) { const [p] = await q('INSERT INTO service_categories(name,slug) VALUES($1,$2) RETURNING id', [n, slug(n)]);
  for (const k of kids) await q('INSERT INTO service_categories(name,slug,parent_id) VALUES($1,$2,$3)', [k, slug(k), p.id]); }
const pw = await bcrypt.hash('demo1234', 10);
const mk = async (e: string, n: string, r: string) => (await q('INSERT INTO users(email,password_hash,name,role) VALUES($1,$2,$3,$4) RETURNING id', [e, pw, n, r]))[0].id;
await mk('customer@demo.test', 'Demo Customer', 'customer'); await mk('admin@demo.test', 'Demo Admin', 'admin');
const po = await mk('provider@demo.test', 'Demo Dentist', 'provider');
const [p] = await q(`INSERT INTO providers(owner_id,name,city,address,verified,lat,lng) VALUES($1,'SAMPLE Smile Dental Clinic','Bengaluru','Sample address',true,12.7094,77.6984) RETURNING id`, [po]);
const [c] = await q(`SELECT id FROM service_categories WHERE slug='dental-clinics'`);
const [s] = await q(`INSERT INTO services(provider_id,category_id,name,duration_min,buffer_min,price_cents,allow_guest) VALUES($1,$2,'Dental checkup',30,10,50000,false) RETURNING id`, [p.id, c.id]);
const [st] = await q(`INSERT INTO staff(provider_id,name) VALUES($1,'Dr. Sample') RETURNING id`, [p.id]);
await q('INSERT INTO staff_services VALUES($1,$2)', [st.id, s.id]);
for (let d = 0; d <= 6; d++) await q(`INSERT INTO availability_rules(staff_id,weekday,start_time,end_time) VALUES($1,$2,'09:00','17:00')`, [st.id, d]);
console.log('seeded (sample data — not for production)'); await pool.end();
