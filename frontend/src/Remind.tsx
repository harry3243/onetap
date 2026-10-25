import { useEffect, useState } from 'react';
import { call } from './Arrive';
const CH: [string, string][] = [['email', 'Email'], ['sms', 'SMS'], ['whatsapp', 'WhatsApp'], ['voice', 'Voice call (late nudges only)']];
export default function Remind() {
  const [s, setS] = useState({ phone: '', channels: ['email'] as string[], locationConsent: false }); const [m, setM] = useState('');
  useEffect(() => { call('/me/notify').then(r => setS({ phone: r.phone || '', channels: r.channels, locationConsent: r.locationConsent })).catch(() => {}); }, []);
  const tog = (c: string) => setS({ ...s, channels: s.channels.includes(c) ? s.channels.filter(x => x !== c) : [...s.channels, c] });
  return <details><summary>Reminders and alerts</summary>
    <p>You get a reminder at 8 AM on the day, 2 hours and 30 minutes before, and nudges if you haven’t checked in.</p>
    <label>Phone (international format) <input value={s.phone} placeholder="+919876543210" onChange={e => setS({ ...s, phone: e.target.value })} /></label>
    {CH.map(([k, l]) => <label key={k} style={{ display: 'block' }}><input type="checkbox" checked={s.channels.includes(k)} onChange={() => tog(k)} /> {l}</label>)}
    <label style={{ display: 'block' }}><input type="checkbox" checked={s.locationConsent} onChange={e => setS({ ...s, locationConsent: e.target.checked })} /> Let me check in with my location. It is read only when I tap “I’m here” and is never stored.</label>
    <button onClick={() => call('/me/notify', { ...s, phone: s.phone || null }).then(() => setM('Saved')).catch(e => setM(e.message))}>Save</button> <small role="status">{m}</small></details>;
}
