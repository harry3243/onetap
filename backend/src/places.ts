import fs from 'fs';
export type Place = { id: string; name: string; category: string; rating: number | null; ratings: number; phone: string | null; hours: string; address: string; lat: number; lng: number; kw?: string; source: 'google' | 'snapshot'; onboarded: false; km?: number };
const snap: Place[] = JSON.parse(fs.readFileSync(new URL('../data/places-anekal.json', import.meta.url), 'utf8'));
// Weighted rating so 5.0 from 9 reviews does not beat 4.8 from 700 (prior: 4.3 avg, weight 20 reviews).
export const score = (r: number | null, n: number) => (r == null ? 0 : (n / (n + 20)) * r + (20 / (n + 20)) * 4.3);
const km = (a: number, b: number, c: number, d: number) => { const r = (x: number) => x * Math.PI / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
const CAT: Record<string, string> = { Healthcare: 'hospital clinic dentist doctor', 'Personal Care': 'salon spa beauty haircut', Education: 'tuition coaching tutor', Vehicle: 'car bike service centre', Home: 'plumber electrician appliance repair', Fitness: 'gym fitness trainer', Professional: 'lawyer advocate financial advisor' };
const catFromTypes = (t: string[] = []) => t.some(x => /hospital|doctor|dent|medical|health/.test(x)) ? 'Healthcare' : t.some(x => /salon|spa|beauty|hair/.test(x)) ? 'Personal Care' : t.some(x => /school|educat|tutor/.test(x)) ? 'Education' : t.some(x => /car_|auto|motor/.test(x)) ? 'Vehicle' : t.some(x => /plumb|electric|laundry/.test(x)) ? 'Home' : t.some(x => /gym|fitness/.test(x)) ? 'Fitness' : t.some(x => /lawyer|accountant|finance/.test(x)) ? 'Professional' : 'Other';
async function live(q: string, category: string, lat: number, lng: number): Promise<Place[]> {
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', { method: 'POST', signal: AbortSignal.timeout(5000),
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!, 'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.shortFormattedAddress,places.location,places.types' },
    body: JSON.stringify({ textQuery: q || CAT[category] || 'services', pageSize: 20, locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 8000 } } }) });
  if (!r.ok) throw new Error('places ' + r.status);
  return ((await r.json()).places || []).map((p: any): Place => ({ id: p.id, name: p.displayName?.text, category: catFromTypes(p.types), rating: p.rating ?? null, ratings: p.userRatingCount ?? 0, phone: p.nationalPhoneNumber ?? null, hours: '', address: p.shortFormattedAddress ?? '', lat: p.location?.latitude, lng: p.location?.longitude, source: 'google', onboarded: false }));
}
export async function searchPlaces(o: { q: string; category: string; lat?: number; lng?: number }) {
  const lat = o.lat ?? 12.7109, lng = o.lng ?? 77.6953; let list: Place[] | null = null, mode = 'snapshot';
  if (process.env.GOOGLE_PLACES_API_KEY) { try { list = await live(o.q, o.category, lat, lng); mode = 'google'; } catch (e: any) { console.error('places fallback:', e.message); } }
  if (!list) { const w = o.q.toLowerCase().split(/\s+/).filter(x => x.length > 2); list = snap.filter(p => (!w.length || w.some(x => (p.name + p.address + p.category + (p.kw || '')).toLowerCase().includes(x)))); }
  list = list.filter(p => !o.category || p.category === o.category).map(p => ({ ...p, km: +km(lat, lng, p.lat, p.lng).toFixed(1) }));
  const exact = o.q.trim().toLowerCase();
  list.sort((a, b) => (+b.name.toLowerCase().includes(exact) * (exact ? 1 : 0)) - (+a.name.toLowerCase().includes(exact) * (exact ? 1 : 0)) || score(b.rating, b.ratings) - score(a.rating, a.ratings));
  return { mode, results: list.slice(0, 20) };
}
