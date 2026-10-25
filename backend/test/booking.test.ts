import { describe, it, expect, afterAll } from 'vitest'; import { pool, q } from '../src/db.js'; import { slots, createBooking } from '../src/booking.js';
afterAll(() => pool.end());
describe('booking', () => {
  it('5 simultaneous requests for one slot -> exactly one succeeds', async () => {
    const [sv] = await q(`SELECT id FROM services LIMIT 1`);
    const date = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    const slot = (await slots(sv.id, date))[0]; expect(slot).toBeTruthy();
    const users = await q(`INSERT INTO users(email,password_hash,name,role) SELECT 'race'||g||'-'||extract(epoch from now())||'@t.test','x','Race','customer' FROM generate_series(1,5) g RETURNING id`);
    const res = await Promise.allSettled(users.map((u: any, i: number) => createBooking({ customerId: u.id, serviceId: sv.id, start: slot.start.toISOString(), key: 'race-key-' + i })));
    expect(res.filter(r => r.status === 'fulfilled').length).toBe(1);
  });
  it('same idempotency key returns the same booking', async () => {
    const [sv] = await q(`SELECT id FROM services LIMIT 1`); const [u] = await q(`SELECT id FROM users WHERE role='customer' LIMIT 1`);
    const date = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10); const slot = (await slots(sv.id, date))[0];
    const o = { customerId: u.id, serviceId: sv.id, start: slot.start.toISOString(), key: 'idem-' + Date.now() };
    const a = await createBooking(o); const b = await createBooking(o); expect(a.id).toBe(b.id);
  });
});
