import { useEffect, useState } from 'react';
import type { PlaceDTO, PlacesRes } from './types';
const CATS = ['Healthcare', 'Personal Care', 'Education', 'Vehicle', 'Home', 'Fitness', 'Professional'];
const score = (p: PlaceDTO) => { const n = p.ratings, r = p.rating ?? 0; return (n / (n + 20)) * r + (20 / (n + 20)) * 4.3; };
// Places are shown ONLY after the person allows live location. Before that this section shows just the permission card.
export default function Nearby({ q }: { q: string }) {
  const [cat, setCat] = useState(''); const [data, setData] = useState<PlacesRes | null>(null); const [err, setErr] = useState('');
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null); const [state, setState] = useState<'ask' | 'asking' | 'denied'>('ask');
  const ask = () => { setState('asking'); if (!navigator.geolocation) return setState('denied');
    navigator.geolocation.getCurrentPosition(p => setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }), () => setState('denied'), { timeout: 12000, enableHighAccuracy: true }); };
  useEffect(() => { if (!loc) return; setData(null); setErr(''); const t = setTimeout(() => {
    const u = new URLSearchParams({ q, category: cat, lat: String(loc.lat), lng: String(loc.lng) });
    fetch('/api/places?' + u).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setData(j); }).catch(e => setErr(e.message || 'Could not load places')); }, 300); return () => clearTimeout(t); }, [q, cat, loc]);
  if (!loc) return <section aria-label="Nearby places"><div className="card"><b>Find shops near you</b><p>Allow location to see shops around you, with distances. It is used only to search and is never stored.</p>
    {state === 'denied' && <p className="err">Location is blocked or unavailable. Turn it on in your browser settings and try again.</p>}<button disabled={state === 'asking'} onClick={ask}>Allow location</button></div></section>;
  const all = data?.results ?? [], near = all.filter(p => (p.km ?? 0) <= 10), far = all.filter(p => (p.km ?? 0) > 10);
  const best = [...all].sort((a, b) => score(b) - 0.08 * (b.km ?? 0) - (score(a) - 0.08 * (a.km ?? 0))).slice(0, 3);
  const Card = ({ p, i }: { p: PlaceDTO; i: number }) => <div className="card"><b>{i + 1}. {p.name}</b> <small>Not on OneTap yet</small><br />★ {p.rating ?? '–'} ({p.ratings}) · {p.category} · {p.km} km<br />{p.address}{p.hours && ' · ' + p.hours}<br />
    {p.phone && <a href={'tel:' + p.phone.replace(/\s/g, '')}><button>Call</button></a>} <a href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&destination_place_id=${p.id}`} target="_blank" rel="noopener"><button className="alt">Directions</button></a></div>;
  const Sec = ({ t, l }: { t: string; l: PlaceDTO[] }) => l.length ? <><h3>{t} ({l.length})</h3>{l.map((p, i) => <Card key={p.id} p={p} i={i} />)}</> : null;
  return <section aria-label="Nearby places"><h2>{q ? `Places matching “${q}”` : 'Shops and services near you'}</h2>
    <p>Real listings from Google Maps, ranked by rating and review count. These businesses are not on OneTap yet, so booking is by phone.</p>
    <div>{CATS.map(c => <button key={c} className={cat === c ? '' : 'alt'} aria-pressed={cat === c} onClick={() => setCat(cat === c ? '' : c)}>{c}</button>)}</div>
    {err && <p className="err">{err}</p>}{!data && !err && <p>Loading…</p>}{data && all.length === 0 && <p>No places found.</p>}
    <Sec t="Best for you" l={best} /><Sec t="Popular near you" l={near} /><Sec t="Other regions" l={far} />
    {data && <small>Source: {data.mode === 'google' ? 'Google Places (live)' : 'saved snapshot'}</small>}</section>;
}
