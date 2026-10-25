import { useEffect, useState } from 'react';
import Nearby from './Nearby'; import ErrorPage from './ErrorPage'; import GuestForm from './GuestForm'; import Arrive from './Arrive'; import Remind from './Remind';
type Any = any;
let token = '';
const csrf = () => (document.cookie.split('; ').find(c => c.startsWith('ot_csrf=')) || '').slice(8); // the session itself is an HttpOnly cookie
const api = async (path: string, body?: Any) => {
  const r = await fetch('/api' + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(body && { 'X-CSRF-Token': csrf() }) }, body: body && JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || 'Something went wrong'), { status: path.startsWith('/auth/') ? 0 : r.status }); return j;
};
const money = (c: number) => '₹' + (c / 100).toFixed(0);
export default function App() {
  const [view, setView] = useState<'home' | 'mine' | 'login'>('home'); const [msg, setMsg] = useState(''); const [page, setPage] = useState(0); const [err, setErr] = useState('');
  const [user, setUser] = useState<Any>(JSON.parse(localStorage.getItem('u') || 'null'));
  const [term, setTerm] = useState(''); const [results, setResults] = useState<Any[] | null>(null); const [prov, setProv] = useState<Any>(null);
  const [svc, setSvc] = useState<Any>(null); const [date, setDate] = useState(new Date(Date.now() + 864e5).toISOString().slice(0, 10)); const [slots, setSlots] = useState<Any[]>([]); const [pick, setPick] = useState<Any>(null);
  const [appts, setAppts] = useState<Any[]>([]); const [f, setF] = useState({ email: '', password: '', name: '' });
  const run = (p: Promise<Any>) => p.catch(e => { setErr(e.message); setMsg(''); if ([401, 403, 500].includes(e.status)) setPage(e.status); });
  const search = () => { setErr(''); setResults(null); run(api('/search?q=' + encodeURIComponent(term)).then(setResults)); };
  useEffect(() => { search(); }, []);
  useEffect(() => { const f = () => { const m = location.hash.match(/^#error-(\d+)/); setPage(m ? +m[1] : 0); }; f(); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  useEffect(() => { if (svc) run(api(`/services/${svc.id}/availability?date=${date}`).then(s => { setSlots(s); setPick(null); })); }, [svc, date]);
  const loadMine = () => run(api('/appointments/mine').then(setAppts));
  const login = (reg: boolean) => run(api(reg ? '/auth/register' : '/auth/login', reg ? { ...f, role: 'customer' } : f).then(r => { if (reg) { setMsg('Account created. Now sign in with the same email and password.'); setErr(''); setF({ ...f, password: '' }); return; } localStorage.setItem('u', JSON.stringify(r.user)); setUser(r.user); setView('home'); setErr(''); }));
  const book = () => { if (!user) return setView('login');
    run(api('/appointments', { serviceId: svc.id, start: pick.start, staffId: pick.staff_id, idempotencyKey: crypto.randomUUID() }).then(a => { setMsg(`Booked! Reference ${a.reference}`); setErr(''); setSvc(null); setProv(null); })); };
  if (page) return <ErrorPage code={page} onHome={() => { location.hash = ''; setPage(0); }} onLogin={() => { location.hash = ''; setPage(0); setView('login'); }} />;
  return <main>
    <header><h1 style={{ margin: 0 }}>OneTap</h1><nav aria-label="Main">
      <button className="alt" onClick={() => { setView('home'); setProv(null); setSvc(null); }}>Home</button>
      {user ? <><button className="alt" onClick={() => { setView('mine'); loadMine(); }}>My appointments</button><button className="alt" onClick={() => { localStorage.clear(); fetch('/api/auth/logout', { method: 'POST' }); setUser(null); }}>Sign out</button></> : <button className="alt" onClick={() => setView('login')}>Sign in</button>}</nav></header>
    <div role="status" aria-live="polite">{msg && <p className="ok">{msg}</p>}{err && <p className="err">{err}</p>}</div>
    {view === 'login' && <section><h2>Sign in or create account</h2>
      <p><input aria-label="Name (new accounts)" placeholder="Name (new accounts)" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></p>
      <p><input aria-label="Email" type="email" placeholder="Email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></p>
      <p><input aria-label="Password" type="password" placeholder="Password (8+ chars)" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></p>
      <button onClick={() => login(false)}>Sign in</button><button className="alt" onClick={() => login(true)}>Create account</button></section>}
    {view === 'mine' && <section><h2>My appointments</h2><Remind />{!appts.length && <p>No appointments yet.</p>}{appts.map(a => <div className="card" key={a.id}><b>{a.service}</b> · {a.provider}<br />{new Date(a.start).toLocaleString()} · {a.status} · {a.reference}<br />
      {a.status === 'confirmed' && <Arrive id={a.id} token={a.cancel_token} />}{['confirmed', 'pending'].includes(a.status) && <button className="alt" onClick={() => run(api(`/appointments/${a.id}/cancel`, {}).then(() => { setMsg('Cancelled'); setErr(''); loadMine(); }))}>Cancel</button>}</div>)}</section>}
    {view === 'home' && !prov && <section><h2>Hello{user ? ', ' + user.name : ''}</h2><h2>What would you like to book?</h2>
      <form onSubmit={e => { e.preventDefault(); search(); }}><input aria-label="Search" style={{ width: '70%' }} placeholder="Dentist, salon, tutor…" value={term} onChange={e => setTerm(e.target.value)} /> <button>Search</button></form>
      {results === null && !err && <p>Loading…</p>}{results?.length === 0 && <p>No providers found. Try another search.</p>}
      {results?.map(p => <div className="card" key={p.id}><b>{p.name}</b> {p.verified && '✓ verified'}<br />{p.city} · from {money(p.from_price)}<br /><button onClick={() => run(api('/providers/' + p.id).then(setProv))}>View & book</button></div>)}<Nearby q={term} /></section>}
    {view === 'home' && prov && <section><button className="alt" onClick={() => { setProv(null); setSvc(null); }}>← Back</button><h2>{prov.name}</h2><p>{prov.address}, {prov.city}</p>
      {prov.services.map((s: Any) => <div className="card" key={s.id}><b>{s.name}</b> · {s.duration_min} min · {money(s.price_cents)}<br />Free cancellation up to {s.cancel_hours_before}h before.<br /><button onClick={() => setSvc(s)}>Choose</button></div>)}
      {svc && <div className="card"><h3>{svc.name}</h3><label>Date <input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        {!slots.length ? <p>No times on this date — try another day.</p> : <div role="group" aria-label="Available times">{slots.map(s => <button key={s.start + s.staff_id} className={pick === s ? '' : 'alt'} aria-pressed={pick === s} onClick={() => setPick(s)}>{new Date(s.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</button>)}</div>}
        {pick && <><p><b>Review:</b> {svc.name} on {new Date(pick.start).toLocaleString()} for {money(svc.price_cents)}. The server re-checks the price and availability.</p>{user ? <button onClick={book}>Confirm booking</button> : <GuestForm serviceId={svc.id} start={pick.start} staffId={pick.staff_id} allow={svc.allow_guest !== false} onLogin={() => setView('login')} onDone={m => { setMsg(m); setErr(''); setSvc(null); setProv(null); }} />}</>}</div>}</section>}
  </main>;
}
