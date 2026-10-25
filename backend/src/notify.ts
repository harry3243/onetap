export type Channel = 'email' | 'sms' | 'whatsapp' | 'voice';
const E = process.env; const x = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
async function twilio(path: string, f: Record<string, string>) {
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${E.TWILIO_SID}/${path}.json`, { method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { Authorization: 'Basic ' + Buffer.from(`${E.TWILIO_SID}:${E.TWILIO_TOKEN}`).toString('base64') }, body: new URLSearchParams(f) });
  if (!r.ok) throw new Error('twilio ' + r.status);
}
// Returns 'sent' when a real provider accepted it, 'test' when no credentials are configured (logged only).
export async function send(ch: Channel, u: { email: string; phone: string | null }, text: string): Promise<'sent' | 'test'> {
  if (ch === 'email' && E.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(8000), headers: { Authorization: 'Bearer ' + E.RESEND_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: E.MAIL_FROM, to: u.email, subject: 'OneTap', text }) });
    if (!r.ok) throw new Error('resend ' + r.status); return 'sent';
  }
  if (ch !== 'email') {
    if (!u.phone) throw new Error('no phone number on file');
    if (E.TWILIO_SID && E.TWILIO_TOKEN) {
      if (ch === 'sms') await twilio('Messages', { To: u.phone, From: E.TWILIO_FROM!, Body: text });
      else if (ch === 'whatsapp') await twilio('Messages', { To: 'whatsapp:' + u.phone, From: 'whatsapp:' + E.TWILIO_WA_FROM!, Body: text });
      else await twilio('Calls', { To: u.phone, From: E.TWILIO_FROM!, Twiml: `<Response><Say language="en-IN">${x(text)}</Say></Response>` });
      return 'sent';
    }
  }
  console.log(`[notify:test] ${ch} -> ${ch === 'email' ? u.email : u.phone}: ${text}`); return 'test';
}
