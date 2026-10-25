import { useState } from 'react';
type P = { serviceId: string; start: string; staffId?: string; allow: boolean; onDone: (m: string) => void; onLogin: () => void };
export default function GuestForm({ serviceId, start, staffId, allow, onDone, onLogin }: P) {
  const [f, setF] = useState({ name: '', phone: '', email: '', consent: false }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  if (!allow) return <p>This provider needs an account to book. <button onClick={onLogin}>Create an account</button></p>;
  const submit = () => { setErr(''); setBusy(true);
    fetch('/api/appointments/guest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serviceId, start, staffId, idempotencyKey: crypto.randomUUID(), name: f.name, phone: f.phone.replace(/[\s-]/g, ''), email: f.email || undefined, consent: f.consent }) })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.details?.fieldErrors ? Object.values(j.details.fieldErrors).flat().join('. ') : j.error); onDone(`Booked as a guest! Reference ${j.reference}. Keep it to manage your booking.`); })
      .catch(e => setErr(e.message)).finally(() => setBusy(false)); };
  return <div><b>Your details</b><p>The provider uses these to contact you.</p>
    <label>Full name <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} autoComplete="name" /></label>
    <label>Phone with country code <input value={f.phone} placeholder="+919876543210" onChange={e => setF({ ...f, phone: e.target.value })} autoComplete="tel" /></label>
    <label>Email (optional) <input value={f.email} onChange={e => setF({ ...f, email: e.target.value })} autoComplete="email" /></label>
    <label style={{ display: 'block' }}><input type="checkbox" checked={f.consent} onChange={e => setF({ ...f, consent: e.target.checked })} /> I agree to share these details with the provider for this appointment.</label>
    {err && <p className="err">{err}</p>}<button disabled={busy || !f.consent} onClick={submit}>Confirm as guest</button> <button className="alt" onClick={onLogin}>Create an account instead</button></div>;
}
