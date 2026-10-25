const E: Record<number, [string, string]> = {
  200: ['OK', 'Everything is working.'], 301: ['Moved permanently', 'This page has a new address.'], 400: ['Bad request', 'Something in the request was missing or invalid.'],
  401: ['Sign in required', 'You need to sign in to see this.'], 403: ['Not allowed', 'Your account does not have access to this.'],
  404: ['Page not found', 'We could not find what you were looking for.'], 500: ['Something went wrong', 'The problem is on our side. Try again in a moment.'] };
export default function ErrorPage({ code, onHome, onLogin }: { code: number; onHome: () => void; onLogin: () => void }) {
  const [t, d] = E[code] || E[500];
  return <main role="alert"><div style={{ font: '700 3rem ui-monospace,monospace' }}>{code}</div><h1>{t}</h1><p>{d}</p>
    <button onClick={onHome}>Go home</button> {code === 401 && <button className="alt" onClick={onLogin}>Sign in</button>}
    <p>{Object.keys(E).map(k => <a key={k} href={'#error-' + k} style={{ marginRight: 10 }}>{k}</a>)}</p></main>;
}
