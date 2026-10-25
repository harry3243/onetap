import { pool, q } from './db.js'; import { send, Channel } from './notify.js';
const API = process.env.API_URL || 'http://localhost:4000', APP = process.env.APP_URL || 'http://localhost:5173';
// Schedule: confirmation now; 8:00 on the day (provider timezone); 2h and 30min before; then check-in nudges at +5/+10/+15 min.
export const planReminders = (id: string) => q(`
  INSERT INTO notifications(appointment_id,kind,scheduled_for)
  SELECT a.id, v.k, v.t FROM appointments a JOIN providers p ON p.id=a.provider_id,
  LATERAL (VALUES ('confirmation', now()),
    ('morning', (date_trunc('day', lower(a.during) AT TIME ZONE p.timezone) + interval '8 hours') AT TIME ZONE p.timezone),
    ('two_hours', lower(a.during) - interval '2 hours'), ('thirty_min', lower(a.during) - interval '30 minutes'),
    ('late_1', lower(a.during) + interval '5 minutes'), ('late_2', lower(a.during) + interval '10 minutes'), ('late_3', lower(a.during) + interval '15 minutes')) v(k,t)
  WHERE a.id=$1 AND (v.k='confirmation' OR v.t > now()) AND NOT (v.k='morning' AND v.t > lower(a.during) - interval '90 minutes')
  ON CONFLICT DO NOTHING`, [id]);
const text = (k: string, d: any, when: string) => {
  const cancel = `Can't make it? ${API}/api/appointments/cancel/${d.cancel_token}`, base = `${d.service} at ${d.provider}, ${when}`;
  if (k === 'confirmation') return `OneTap: booked ${base}. Ref ${d.reference}. Add to calendar with alarm: ${API}/api/appointments/ics/${d.cancel_token}. ${cancel}`;
  if (k === 'morning') return `Good morning! Today: ${base}. Plan your travel. ${cancel}`;
  if (k === 'two_hours') return `Reminder: ${base}, in about 2 hours. Open OneTap and tap "I'm here" when you arrive. ${cancel}`;
  if (k === 'thirty_min') return `Starts in 30 minutes: ${base}. Time to leave. ${cancel}`;
  return `You have not checked in for ${base}, which started ${5 * +k.slice(-1)} min ago. Open OneTap to check in, or cancel here: ${API}/api/appointments/cancel/${d.cancel_token}`;
};
export async function runDue() {
  const c = await pool.connect(); try {
    await c.query('BEGIN');
    const due = (await c.query(`SELECT n.id,n.kind,a.status,a.arrived_at,a.reference,a.cancel_token,lower(a.during) AS start,COALESCE(u.email,a.guest_email) AS email,COALESCE(u.phone,a.guest_phone) AS phone,COALESCE(u.notify_channels,CASE WHEN a.guest_email IS NULL THEN ARRAY['sms'] ELSE ARRAY['sms','email'] END) AS ch,s.name AS service,p.name AS provider,p.timezone
      FROM notifications n JOIN appointments a ON a.id=n.appointment_id LEFT JOIN users u ON u.id=a.customer_id JOIN services s ON s.id=a.service_id JOIN providers p ON p.id=a.provider_id
      WHERE n.status='pending' AND n.scheduled_for<=now() ORDER BY n.scheduled_for LIMIT 50 FOR UPDATE OF n SKIP LOCKED`)).rows;
    for (const d of due) {
      if (d.status !== 'confirmed' || (d.kind.startsWith('late') && d.arrived_at)) { await c.query(`UPDATE notifications SET status='skipped' WHERE id=$1`, [d.id]); continue; }
      const when = new Date(d.start).toLocaleString('en-IN', { timeZone: d.timezone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
      const chans: Channel[] = (d.ch as Channel[]).filter(x => x !== 'voice' || d.kind === 'late_2' || d.kind === 'late_3'); // calls only for late nudges
      const out: string[] = []; let ok = 0;
      for (const ch of chans) { try { out.push(ch + ':' + await send(ch, d, text(d.kind, d, when))); ok++; } catch (e: any) { out.push(ch + ':failed(' + e.message + ')'); } }
      await c.query(`UPDATE notifications SET status=$2, sent_at=now(), result=$3 WHERE id=$1`, [d.id, ok ? 'sent' : 'failed', out.join(', ')]);
    }
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
}
