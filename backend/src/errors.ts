import type { Request, Response } from 'express';
const T: Record<number, [string, string]> = {
  200: ['OK', 'Everything is working. This is what a successful response looks like.'],
  301: ['Moved permanently', 'This page has a new address. Browsers follow it automatically.'],
  400: ['Bad request', 'The request was incomplete or invalid. Check the details and try again.'],
  401: ['Sign in required', 'You need to sign in to see this.'],
  403: ['Not allowed', 'Your account does not have access to this.'],
  404: ['Page not found', 'We could not find what you were looking for.'],
  500: ['Something went wrong', 'The problem is on our side. Try again in a moment.'] };
export const codes = Object.keys(T).map(Number);
export const errorPage = (code: number) => { const [title, text] = T[code] ?? [code === 429 ? 'Too many requests' : 'Something went wrong', 'Please try again later.'];
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${code} ${title}</title>
<style>:root{--bg:#FAFAFA;--sf:#F0EFEA;--ink:#1A1A1A;--mut:#666;--ln:#DAD8D0;--ac:#2563EB}@media(prefers-color-scheme:dark){:root{--bg:#121212;--sf:#1C1C1B;--ink:#FAFAFA;--mut:#A3A3A3;--ln:#2E2E2C;--ac:#60A5FA}}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh}main{max-width:480px;padding:28px;background:var(--sf);border:1px solid var(--ln);border-radius:10px;margin:16px}
.c{font:700 3.2rem ui-monospace,Menlo,monospace;color:${code < 300 ? 'var(--ac)' : 'var(--mut)'}}h1{margin:4px 0 8px;font-size:1.5rem}p{color:var(--mut)}a.b{display:inline-block;background:var(--ac);color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600}
nav{margin-top:18px;font:.85rem ui-monospace,monospace}nav a{color:var(--mut);margin-right:10px}</style><main><div class="c">${code}</div><h1>${title}</h1><p>${text}</p><a class="b" href="${process.env.APP_URL || '/'}">Go home</a>
<nav>${codes.map(c => `<a href="/errors/${c}">${c}</a>`).join('')}</nav></main>`; };
// API paths always get JSON {error,status,details?}; everything else gets a styled page with the right HTTP status.
export function fail(req: Request, res: Response, status: number, error: string, details?: unknown) {
  if (req.path.startsWith('/api/')) return res.status(status).json({ error, status, ...(details ? { details } : {}) });
  return res.status(status).type('html').send(errorPage(status)); }
export function mountErrors(app: any) {
  app.get('/errors/:code', (req: Request, res: Response) => { const c = +req.params.code; if (!codes.includes(c)) return fail(req, res, 404, 'Not found');
    if (c === 301) res.set('Location', '/errors/200'); res.status(c).type('html').send(errorPage(c)); }); }
