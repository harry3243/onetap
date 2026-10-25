import { useState } from 'react';
export const call = (p: string, b?: any) => fetch('/api' + p, { method: b ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': (document.cookie.split('; ').find(c => c.startsWith('ot_csrf=')) || '').slice(8) }, body: b && JSON.stringify(b) })
  .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Failed'); return j; });
export default function Arrive({ id, token }: { id: string; token: string }) {
  const [m, setM] = useState('');
  const go = () => { if (!navigator.geolocation) return setM('Location is not available on this device.'); setM('Checking your location…');
    navigator.geolocation.getCurrentPosition(p => call(`/appointments/${id}/arrive`, { lat: p.coords.latitude, lng: p.coords.longitude }).then(r => setM(r.message)).catch(e => setM(e.message)),
      () => setM('Location permission was denied. Allow it and tap again.'), { enableHighAccuracy: true, timeout: 10000 }); };
  return <span><button onClick={go}>I’m here · check in</button> <a href={'/api/appointments/ics/' + token}>Add alarm to calendar</a> <small role="status">{m}</small><br /></span>;
}
