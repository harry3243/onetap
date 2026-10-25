import { z } from 'zod'; import * as S from './schemas.js'; import rateLimit from 'express-rate-limit'; import { q } from './db.js'; import { HttpError, createBooking } from './booking.js'; import { planReminders } from './reminders.js';
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
export const meters = (a: number, b: number, c: number, d: number) => { const r = (x: number) => x * Math.PI / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 12742000 * Math.asin(Math.sqrt(h)); };
const ics = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, '');
const page = (b: string) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:18px system-ui;max-width:420px;margin:40px auto;padding:0 16px">${b}`;
export function mount(app: any, auth: any, h: any) {
  const ch = z.enum(['email', 'sms', 'whatsapp', 'voice']);
  app.get('/api/me/notify', auth(), h(async (req: any, res: any) => { const [u] = await q('SELECT phone,notify_channels AS channels,location_consent AS "locationConsent" FROM users WHERE id=$1', [req.user.id]); res.json(u); }));
  app.post('/api/me/notify', auth(), h(async (req: any, res: any) => {
    const b = S.NotifySettings.parse(req.body);
    if (b.channels.some(c => c !== 'email') && !b.phone) throw new HttpError(400, 'Add a phone number to receive SMS, WhatsApp or calls');
    await q('UPDATE users SET phone=$2,notify_channels=$3,location_consent=$4 WHERE id=$1', [req.user.id, b.phone, b.channels, b.locationConsent]); res.json({ ok: true });
  }));
  app.post('/api/provider/location', auth('provider'), h(async (req: any, res: any) => {
    const b = S.Coords.parse(req.body);
    await q('UPDATE providers SET lat=$2,lng=$3 WHERE owner_id=$1', [req.user.id, b.lat, b.lng]); res.json({ ok: true });
  }));
  const guestLimit = rateLimit({ windowMs: 3600000, limit: 10 });
  app.post('/api/appointments/guest', guestLimit, h(async (req: any, res: any) => {
    const b = S.GuestAppointment.parse(req.body);
    const [{ n }] = await q(`SELECT count(*)::int AS n FROM appointments WHERE guest_phone=$1 AND status IN('pending','confirmed') AND lower(during)>now() AND idempotency_key<>$2`, [b.phone, b.idempotencyKey]);
    if (n >= 2) throw new HttpError(429, 'Too many upcoming guest bookings for this number. Create an account to book more.');
    const a = await createBooking({ customerId: null, guest: { name: b.name, phone: b.phone, email: b.email }, serviceId: b.serviceId, start: b.start, staffId: b.staffId, key: b.idempotencyKey });
    await planReminders(a.id).catch(e => console.error('plan reminders:', e.message));
    await q('INSERT INTO audit_logs(action,entity,entity_id) VALUES($1,$2,$3)', ['booking.create_guest', 'appointment', a.id]);
    res.status(201).json({ reference: a.reference, cancelToken: a.cancel_token, status: a.status });
  }));
  // Check-in: location is read only when the customer taps the button, only if they consented, and is never stored (only arrived_at).
  app.post('/api/appointments/:id/arrive', auth('customer'), h(async (req: any, res: any) => {
    const b = S.Coords.parse(req.body);
    const [a] = await q(`SELECT a.id,a.status,a.arrived_at,lower(a.during) AS start,p.lat,p.lng,u.location_consent FROM appointments a JOIN providers p ON p.id=a.provider_id JOIN users u ON u.id=a.customer_id WHERE a.id=$1 AND a.customer_id=$2`, [req.params.id, req.user.id]);
    if (!a) throw new HttpError(404, 'Not found'); if (!a.location_consent) throw new HttpError(403, 'Turn on location check-in in Reminders first');
    if (a.status !== 'confirmed') throw new HttpError(409, 'This appointment is not active'); if (a.lat == null) throw new HttpError(409, 'The provider has not set a location yet');
    const mins = (Date.now() - +new Date(a.start)) / 60000; if (mins < -120 || mins > 60) throw new HttpError(409, 'Check-in opens 2 hours before and closes 1 hour after the start');
    const d = Math.round(meters(b.lat, b.lng, a.lat, a.lng));
    if (d > 150) return res.json({ arrived: false, distanceM: d, message: `You are about ${d >= 1000 ? (d / 1000).toFixed(1) + ' km' : d + ' m'} away. Keep going.` });
    await q('UPDATE appointments SET arrived_at=COALESCE(arrived_at,now()) WHERE id=$1', [a.id]);
    const late = Math.max(0, Math.round(mins)); res.json({ arrived: true, onTime: late <= 5, minutesLate: late, message: late <= 5 ? 'Checked in. You are on time.' : `Checked in, ${late} min late. We told the provider.` });
  }));
  app.get('/api/appointments/ics/:token', h(async (req: any, res: any) => {
    const [a] = await q(`SELECT a.reference,lower(a.during) AS s,upper(a.during) AS e,sv.name AS service,p.name AS provider,p.address FROM appointments a JOIN services sv ON sv.id=a.service_id JOIN providers p ON p.id=a.provider_id WHERE a.cancel_token=$1`, [req.params.token]);
    if (!a) throw new HttpError(404, 'Not found'); const al = (m: number) => `BEGIN:VALARM\r\nTRIGGER:-PT${m}M\r\nACTION:DISPLAY\r\nDESCRIPTION:${a.service}\r\nEND:VALARM`;
    res.type('text/calendar').send(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OneTap//EN', 'BEGIN:VEVENT', `UID:${a.reference}@onetap`, `DTSTAMP:${ics(new Date())}`, `DTSTART:${ics(new Date(a.s))}`, `DTEND:${ics(new Date(a.e))}`,
      `SUMMARY:${a.service} at ${a.provider}`, `LOCATION:${a.address || ''}`, al(60), al(15), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'));
  }));
  // Cancel via message link. GET only shows a confirm page (link previews cannot cancel); POST cancels. Late cancels are allowed but flagged.
  const info = (t: string) => q(`SELECT a.id,a.status,lower(a.during) AS start,sv.name AS service,p.name AS provider,sv.cancel_hours_before AS ch FROM appointments a JOIN services sv ON sv.id=a.service_id JOIN providers p ON p.id=a.provider_id WHERE a.cancel_token=$1`, [t]);
  app.get('/api/appointments/cancel/:token', h(async (req: any, res: any) => {
    const [a] = await info(req.params.token); if (!a) return res.status(404).send(page('<p>Link not found.</p>'));
    if (a.status !== 'confirmed') return res.send(page(`<p>This appointment is already ${esc(a.status)}.</p>`));
    res.send(page(`<h2>Cancel appointment?</h2><p><b>${esc(a.service)}</b> at ${esc(a.provider)}<br>${new Date(a.start).toUTCString()}</p><form method="post"><button style="font:inherit;padding:12px 20px">Yes, cancel it</button></form>`));
  }));
  app.post('/api/appointments/cancel/:token', h(async (req: any, res: any) => {
    const [a] = await info(req.params.token); if (!a || a.status !== 'confirmed' || +new Date(a.start) < Date.now()) return res.status(409).send(page('<p>This appointment can no longer be cancelled here.</p>'));
    const late = +new Date(a.start) - Date.now() < a.ch * 3600000;
    await q(`UPDATE appointments SET status='cancelled' WHERE id=$1`, [a.id]); await q('INSERT INTO appointment_status_history(appointment_id,status) VALUES($1,$2)', [a.id, late ? 'cancelled_late' : 'cancelled']);
    await q('INSERT INTO audit_logs(action,entity,entity_id) VALUES($1,$2,$3)', [late ? 'booking.cancel_late_link' : 'booking.cancel_link', 'appointment', a.id]);
    res.send(page(`<h2>Cancelled</h2><p>Your appointment is cancelled${late ? ' (late cancellation: the provider may apply their policy)' : ''}.</p>`));
  }));
}
