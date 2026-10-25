import crypto from 'crypto'; import { pool, q } from './db.js';
export class HttpError extends Error { constructor(public status: number, m: string) { super(m); } }
// Slots for a service on a calendar date (provider's timezone), per staff, excluding booked times.
export const slots = (serviceId: string, date: string) => q(`
  SELECT s AS start, st.id AS staff_id FROM services sv JOIN providers p ON p.id=sv.provider_id
  JOIN staff_services ss ON ss.service_id=sv.id JOIN staff st ON st.id=ss.staff_id AND st.active
  JOIN availability_rules r ON r.staff_id=st.id AND r.weekday=extract(dow FROM $2::date)
  CROSS JOIN LATERAL generate_series(($2::date + r.start_time) AT TIME ZONE p.timezone,
      ($2::date + r.end_time) AT TIME ZONE p.timezone - make_interval(mins=>sv.duration_min), interval '30 min') s
  WHERE sv.id=$1 AND sv.active AND s > now() AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.staff_id=st.id
    AND a.status IN('pending','confirmed') AND a.during && tstzrange(s, s + make_interval(mins=>sv.duration_min+sv.buffer_min)))
  ORDER BY s, st.name`, [serviceId, date]);
export async function createBooking(o: { customerId: string | null; guest?: { name: string; phone: string; email?: string }; serviceId: string; start: string; staffId?: string; key: string }) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const dup = (await c.query('SELECT * FROM appointments WHERE customer_id IS NOT DISTINCT FROM $1::uuid AND idempotency_key=$2', [o.customerId, o.key])).rows[0];
    if (dup) { await c.query('COMMIT'); return dup; }
    const sv = (await c.query(`SELECT sv.*, p.timezone FROM services sv JOIN providers p ON p.id=sv.provider_id WHERE sv.id=$1 AND sv.active`, [o.serviceId])).rows[0];
    if (!sv) throw new HttpError(404, 'Service not found');
    if (!o.customerId && !sv.allow_guest) throw new HttpError(403, 'This provider requires an account to book');
    const start = new Date(o.start); if (isNaN(+start) || start <= new Date()) throw new HttpError(400, 'Invalid start time');
    const date = (await c.query(`SELECT (($1::timestamptz) AT TIME ZONE $2)::date::text d`, [start.toISOString(), sv.timezone])).rows[0].d;
    const cands = (await slots(o.serviceId, date)).filter(s => +new Date(s.start) === +start && (!o.staffId || s.staff_id === o.staffId));
    if (!cands.length) throw new HttpError(409, 'That time is no longer available');
    for (const cand of cands) {
      await c.query('SAVEPOINT sp');
      try {
        const end = new Date(+start + (sv.duration_min + sv.buffer_min) * 60000);
        const r = await c.query(`INSERT INTO appointments(reference,customer_id,provider_id,service_id,staff_id,during,price_cents,idempotency_key,guest_name,guest_phone,guest_email)
          VALUES($1,$2,$3,$4,$5,tstzrange($6,$7),$8,$9,$10,$11,$12) RETURNING *`,
          ['OT-' + crypto.randomBytes(4).toString('hex').toUpperCase(), o.customerId, sv.provider_id, sv.id, cand.staff_id, start, end, sv.price_cents, o.key, o.guest?.name ?? null, o.guest?.phone ?? null, o.guest?.email ?? null]);
        await c.query('INSERT INTO appointment_status_history(appointment_id,status,changed_by) VALUES($1,$2,$3)', [r.rows[0].id, 'confirmed', o.customerId]);
        await c.query('COMMIT'); return r.rows[0];
      } catch (e: any) { if (e.code === '23P01') { await c.query('ROLLBACK TO sp'); continue; } throw e; }
    }
    throw new HttpError(409, 'That time was just booked by someone else');
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
}
