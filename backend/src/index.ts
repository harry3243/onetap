import 'dotenv/config'; import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors'; import helmet from 'helmet'; import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs'; import jwt from 'jsonwebtoken'; import { z } from 'zod'; import crypto from 'crypto'; import * as S from './schemas.js'; import { fail, mountErrors } from './errors.js'; import { bundle, validLang } from './i18n.js';
import { q } from './db.js'; import { searchPlaces } from './places.js'; import { mount } from './engagement.js'; import { planReminders, runDue } from './reminders.js'; import { slots, createBooking, HttpError } from './booking.js';
const SECRET = process.env.JWT_SECRET!; if (!SECRET) throw new Error('JWT_SECRET required');
const app = express(); app.use(helmet(), cors({ origin: process.env.APP_URL || 'http://localhost:5173', credentials: true }), express.json({ limit: '100kb' }), rateLimit({ windowMs: 60000, limit: 300 }));
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);
const authLimit = rateLimit({ windowMs: 15 * 60000, limit: 30 });
type U = { id: string; role: string };
const cookieOf = (req: any, n: string) => (req.headers.cookie || '').split(/;\s*/).map((c: string) => c.split('=')).find((p: string[]) => p[0] === n)?.[1];
// Session lives in an HttpOnly cookie (JS cannot read it). State-changing requests made with the cookie must echo the ot_csrf cookie in an X-CSRF-Token header.
const auth = (...roles: string[]) => (req: any, _: Response, next: NextFunction) => {
  try {
    const bearer = (req.headers.authorization || '').replace('Bearer ', ''), viaCookie = !bearer;
    const u = jwt.verify(bearer || cookieOf(req, 'ot_session') || '', SECRET) as U;
    if (viaCookie && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (!req.headers['x-csrf-token'] || req.headers['x-csrf-token'] !== cookieOf(req, 'ot_csrf'))) throw new HttpError(403, 'Missing or invalid CSRF token');
    if (roles.length && !roles.includes(u.role)) throw new HttpError(403, 'Forbidden'); req.user = u; next();
  } catch (e) { next(e instanceof HttpError ? e : new HttpError(401, 'Unauthorized')); } };
const setSession = (res: Response, u: any) => { const o = { sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', maxAge: 8 * 3600e3, path: '/' };
  res.cookie('ot_session', sign(u), { ...o, httpOnly: true }); res.cookie('ot_csrf', crypto.randomBytes(16).toString('hex'), { ...o, httpOnly: false }); };
const h = (f: (req: any, res: Response) => Promise<any>) => (req: Request, res: Response, n: NextFunction) => f(req, res).catch(n);
const sign = (u: any) => jwt.sign({ id: u.id, role: u.role }, SECRET, { expiresIn: '8h' });
const audit = (actor: string, action: string, entity: string, id: string) => q('INSERT INTO audit_logs(actor_id,action,entity,entity_id) VALUES($1,$2,$3,$4)', [actor, action, entity, id]);

app.post('/api/auth/register', authLimit, h(async (req, res) => {
  const b = S.Register.parse(req.body);
  const [u] = await q('INSERT INTO users(email,password_hash,name,role) VALUES(lower($1),$2,$3,$4) RETURNING id,role,name', [b.email, await bcrypt.hash(b.password, 10), b.name, b.role])
    .catch(e => { throw e.code === '23505' ? new HttpError(409, 'Email already registered') : e; });
  if (b.role === 'provider') await q('INSERT INTO providers(owner_id,name,city) VALUES($1,$2,$3)', [u.id, b.businessName || b.name, b.city || null]);
  res.status(201).json({ user: { id: u.id, name: u.name, role: u.role } }); // no token: the person must sign in next
}));
app.post('/api/auth/login', authLimit, h(async (req, res) => {
  const b = S.Login.parse(req.body);
  const [u] = await q('SELECT * FROM users WHERE email=lower($1)', [b.email]);
  const ok = await bcrypt.compare(b.password, u ? u.password_hash : DUMMY_HASH); // same work whether or not the email exists
  if (!u || !ok) throw new HttpError(401, 'Email or password is incorrect');
  setSession(res, u); res.json({ user: { id: u.id, role: u.role, name: u.name, email: u.email } });
}));
app.post('/api/auth/logout', (_req, res) => { res.clearCookie('ot_session', { path: '/' }); res.clearCookie('ot_csrf', { path: '/' }); res.json({ ok: true }); });
app.get('/api/auth/me', auth(), h(async (req, res) => { const [u] = await q('SELECT id,name,email,role FROM users WHERE id=$1', [req.user.id]); if (!u) throw new HttpError(401, 'Unauthorized'); res.json({ user: u }); }));
app.get('/api/i18n/:lang', h(async (req, res) => {
  if (!validLang(req.params.lang)) throw new HttpError(400, 'Invalid language code');
  const b = await bundle(req.params.lang); if (!b) throw new HttpError(501, 'Machine translation is not configured (set GOOGLE_TRANSLATE_API_KEY)');
  res.json(b);
}));
app.get('/api/categories', h(async (_, res) => res.json(await q('SELECT id,parent_id,name,slug FROM service_categories WHERE active ORDER BY id'))));
app.get('/api/search', h(async (req, res) => {
  const { q: t = '', category = '', city = '' } = req.query as Record<string, string>;
  res.json(await q(`SELECT DISTINCT p.id,p.name,p.city,p.verified, (SELECT min(price_cents) FROM services WHERE provider_id=p.id AND active) AS from_price
    FROM providers p JOIN services s ON s.provider_id=p.id AND s.active LEFT JOIN service_categories c ON c.id=s.category_id
    WHERE ($1='' OR p.name ILIKE '%'||$1||'%' OR s.name ILIKE '%'||$1||'%' OR c.name ILIKE '%'||$1||'%')
      AND ($2='' OR c.slug=$2 OR c.parent_id=(SELECT id FROM service_categories WHERE slug=$2)) AND ($3='' OR p.city ILIKE $3) LIMIT 50`, [t, category, city]));
}));
app.get('/api/providers/:id', h(async (req, res) => {
  const [p] = await q('SELECT id,name,city,address,timezone,verified FROM providers WHERE id=$1', [req.params.id]); if (!p) throw new HttpError(404, 'Not found');
  res.json({ ...p, services: await q('SELECT id,name,duration_min,price_cents,cancel_hours_before,allow_guest FROM services WHERE provider_id=$1 AND active', [p.id]) });
}));
app.get('/api/services/:id/availability', h(async (req, res) => {
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.date); res.json(await slots(req.params.id, date));
}));
app.post('/api/appointments', auth('customer'), h(async (req, res) => {
  const b = S.CreateAppointment.parse(req.body);
  const a = await createBooking({ customerId: req.user.id, serviceId: b.serviceId, start: b.start, staffId: b.staffId, key: b.idempotencyKey });
  await audit(req.user.id, 'booking.create', 'appointment', a.id); await planReminders(a.id).catch(e => console.error('plan reminders:', e.message)); res.status(201).json(a);
}));
app.get('/api/appointments/mine', auth('customer'), h(async (req, res) => res.json(await q(
  `SELECT a.id,a.reference,a.cancel_token,a.status,a.price_cents,lower(a.during) AS start,s.name AS service,p.name AS provider FROM appointments a JOIN services s ON s.id=a.service_id
   JOIN providers p ON p.id=a.provider_id WHERE a.customer_id=$1 ORDER BY lower(a.during) DESC`, [req.user.id]))));
app.post('/api/appointments/:id/cancel', auth('customer'), h(async (req, res) => {
  const [a] = await q(`SELECT a.*, s.cancel_hours_before FROM appointments a JOIN services s ON s.id=a.service_id WHERE a.id=$1 AND a.customer_id=$2`, [req.params.id, req.user.id]);
  if (!a) throw new HttpError(404, 'Not found'); if (!['pending', 'confirmed'].includes(a.status)) throw new HttpError(409, 'Not cancellable');
  const [{ ok }] = await q(`SELECT (lower($1::tstzrange) - now()) >= make_interval(hours=>$2) AS ok`, [a.during, a.cancel_hours_before]);
  if (!ok) throw new HttpError(409, `Cancellations close ${a.cancel_hours_before}h before the appointment`);
  await q(`UPDATE appointments SET status='cancelled' WHERE id=$1`, [a.id]);
  await q('INSERT INTO appointment_status_history(appointment_id,status,changed_by) VALUES($1,$2,$3)', [a.id, 'cancelled', req.user.id]); await audit(req.user.id, 'booking.cancel', 'appointment', a.id);
  res.json({ ok: true });
}));
app.get('/api/places', h(async (req, res) => {
  const b = S.PlacesQuery.parse(req.query);
  res.json(await searchPlaces(b)); // real listings, NOT bookable until the business joins OneTap
}));
// Provider APIs — always scoped to the caller's own provider row (never trust client-sent provider ids)
const mine = async (uid: string) => { const [p] = await q('SELECT id FROM providers WHERE owner_id=$1', [uid]); if (!p) throw new HttpError(403, 'No provider profile'); return p.id as string; };
app.post('/api/provider/services', auth('provider'), h(async (req, res) => {
  const b = S.ProviderService.parse(req.body);
  const [s] = await q('INSERT INTO services(provider_id,category_id,name,duration_min,buffer_min,price_cents,allow_guest) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *', [await mine(req.user.id), b.categoryId ?? null, b.name, b.durationMin, b.bufferMin, b.priceCents, b.allowGuest]); res.status(201).json(s);
}));
app.post('/api/provider/staff', auth('provider'), h(async (req, res) => {
  const b = S.ProviderStaff.parse(req.body); const pid = await mine(req.user.id);
  const [s] = await q('INSERT INTO staff(provider_id,name) VALUES($1,$2) RETURNING *', [pid, b.name]);
  await q(`INSERT INTO staff_services SELECT $1, id FROM services WHERE provider_id=$2 AND id=ANY($3::uuid[])`, [s.id, pid, b.serviceIds]); res.status(201).json(s);
}));
app.post('/api/provider/availability', auth('provider'), h(async (req, res) => {
  const b = S.ProviderAvailability.parse(req.body);
  const [ok] = await q('SELECT 1 FROM staff WHERE id=$1 AND provider_id=$2', [b.staffId, await mine(req.user.id)]); if (!ok) throw new HttpError(404, 'Staff not found');
  const [r] = await q('INSERT INTO availability_rules(staff_id,weekday,start_time,end_time) VALUES($1,$2,$3,$4) RETURNING *', [b.staffId, b.weekday, b.start, b.end]); res.status(201).json(r);
}));
app.get('/api/provider/appointments', auth('provider'), h(async (req, res) => res.json(await q(
  `SELECT a.id,a.reference,a.status,lower(a.during) AS start,s.name AS service,st.name AS staff,COALESCE(u.name,a.guest_name) AS customer,COALESCE(u.phone,a.guest_phone) AS phone,(a.customer_id IS NULL) AS guest FROM appointments a JOIN services s ON s.id=a.service_id
   JOIN staff st ON st.id=a.staff_id LEFT JOIN users u ON u.id=a.customer_id WHERE a.provider_id=$1 ORDER BY lower(a.during)`, [await mine(req.user.id)]))));
mount(app, auth, h);
mountErrors(app);
app.use((req, res) => fail(req, res, 404, 'Not found'));
app.use((e: any, req: Request, res: Response, _n: NextFunction) => {
  if (e instanceof z.ZodError) return fail(req, res, 400, 'Validation failed', e.flatten());
  if (e instanceof HttpError) return fail(req, res, e.status, e.message);
  if (e?.type === 'entity.parse.failed') return fail(req, res, 400, 'Malformed JSON body');
  if (e?.type === 'entity.too.large') return fail(req, res, 413, 'Request body too large');
  console.error(e?.message); fail(req, res, 500, 'Internal error'); });
app.listen(process.env.PORT || 4000, () => console.log('OneTap API up'));
setInterval(() => runDue().catch(e => console.error('reminders:', e.message)), 60000);
