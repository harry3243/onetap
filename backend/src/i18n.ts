import fs from 'fs';
const EN: Record<string, string> = JSON.parse(fs.readFileSync(new URL('../data/i18n-en.json', import.meta.url), 'utf8'));
const CACHE = new URL('../data/i18n-cache/', import.meta.url);
export const RTL = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv']);
export const validLang = (l: string) => /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(l); // also blocks path tricks since it names a cache file
export interface Bundle { lang: string; dir: 'ltr' | 'rtl'; machine: boolean; strings: Record<string, string> }
// English is hand-written. Any other language Google Translate supports is machine-translated on first request, then cached on disk.
export async function bundle(lang: string): Promise<Bundle | null> {
  const base = lang.split('-')[0];
  if (base === 'en') return { lang, dir: 'ltr', machine: false, strings: EN };
  const key = process.env.GOOGLE_TRANSLATE_API_KEY; if (!key) return null;
  fs.mkdirSync(CACHE, { recursive: true }); const file = new URL(`${lang}.json`, CACHE);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const keys = Object.keys(EN);
  const r = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000), body: JSON.stringify({ q: keys.map(k => EN[k]), source: 'en', target: lang, format: 'text' }) });
  if (!r.ok) throw new Error('translate ' + r.status);
  const out: string[] = (await r.json()).data.translations.map((t: any) => t.translatedText);
  const res: Bundle = { lang, dir: RTL.has(base) ? 'rtl' : 'ltr', machine: true, strings: Object.fromEntries(keys.map((k, i) => [k, out[i]])) };
  fs.writeFileSync(file, JSON.stringify(res)); return res;
}
