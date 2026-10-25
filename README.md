# OneTap — universal appointment booking (vertical slice)

## Run locally
```
docker compose up -d
cp .env.example backend/.env
cd backend && npm i && npm run migrate && npm run seed && npm run dev   # API :4000
cd ../frontend && npm i && npm run dev                                   # UI  :5173
cd ../backend && npm test                                                # concurrency test (needs seeded DB)
```
Demo logins: customer@demo.test / provider@demo.test / admin@demo.test, password `demo1234`.

## Implemented (backend migrations, seed, booking concurrency test and the reminder flow were run against Postgres 16; the React UI and live Google/Twilio/Resend calls were not run)
- JWT auth (bcrypt, zod validation, rate limiting, helmet), server-side role checks (customer/provider/admin)
- Normalized Postgres schema + migration; configurable category tree
- Availability computed in provider timezone from weekly rules minus existing appointments
- Booking: server-side price, idempotency keys, **double-booking prevented by a Postgres exclusion constraint** (btree_gist) plus server revalidation
- Cancel (owner only, status history + audit log), provider services/staff/hours/appointments APIs
- React UI: search → provider → slot → confirm → my appointments / cancel
- Vitest test: 5 simultaneous requests for one slot → exactly 1 succeeds

## API
POST /api/auth/register | /login · GET /api/categories · GET /api/search?q=&category=&city=
GET /api/providers/:id · GET /api/services/:id/availability?date=YYYY-MM-DD
POST /api/appointments {serviceId,start,staffId?,idempotencyKey} · GET /api/appointments/mine · POST /api/appointments/:id/cancel
Provider: POST /api/provider/services | /staff | /availability · GET /api/provider/appointments

## NOT yet built (planned next)
Rescheduling, repeat booking, waitlists, email notifications, dependents, reviews, AI/voice search, Kannada i18n and accessibility settings, provider analytics, external integration adapters, admin UI, remaining schema tables (see spec §9), deployment config.

## Design preview
`preview/index.html` is the latest UI design (sign-in first, language selector, minimal layout). Open it directly in a browser.
It runs on in-browser sample data only and is separate from the React app in `frontend/`, which still uses the older, plainer UI.
Porting this design into `frontend/` is the next step.

## Nearby places (new)
`GET /api/places?q=&category=&lat=&lng=` returns real local businesses ranked by rating (weighted by review count), with call and map links.
With `GOOGLE_PLACES_API_KEY` set it queries Google Places (New) live; without it, it serves a saved snapshot of 22 real Anekal listings (`backend/data/places-anekal.json`).
Places are marked `onboarded:false`: no booking slots are shown for them until the business joins OneTap. The live Google path has not been tested (no key available when this was built).

## Reminders, check-in and cancel links (new)
- On booking, the server schedules: confirmation (now), 8:00 on the day (provider timezone), 2h and 30min before, and check-in nudges at +5/+10/+15 min (skipped once the customer checks in or cancels). A scheduler runs every minute (`src/reminders.ts`).
- Channels: email, SMS, WhatsApp, voice call (voice only for the later late-nudges). Set the keys in `.env.example`; without them messages are logged to the console as `[notify:test]`.
- Real sending needs paid accounts: Resend (email), Twilio (SMS/voice/WhatsApp). In India, SMS needs DLT registration and WhatsApp needs approved message templates. The Twilio and Resend calls are written to their docs but untested.
- Alarms: a web app cannot set a phone alarm. `GET /api/appointments/ics/:token` returns a calendar event with alerts 60 and 15 min before; opening it adds the event and alarms to the phone's calendar.
- Location check-in: `POST /api/appointments/:id/arrive` needs the customer's opt-in (Reminders panel) and reads location only when the button is tapped. Within 150 m of the provider counts as arrived. Coordinates are never stored, only the arrival time. Providers set their position with `POST /api/provider/location`.
- Last-minute cancel: every message has a link to a confirm page (`/api/appointments/cancel/:token`). Cancelling inside the cancellation window is allowed and recorded as `cancelled_late`.
- Limitation: a website cannot track location in the background, so automatic "are you arriving?" detection needs a native app (e.g. wrapping this UI with Capacitor). Always-on tracking is deliberately not built; it should stay opt-in.

## Sign-up and sign-in rules
1. Create an account first (`POST /api/auth/register`). It stores the email and a bcrypt hash of the password, and does NOT log you in.
2. Then sign in (`POST /api/auth/login`). Login succeeds only if an account with that email exists AND the password matches the stored hash.
3. Wrong email and wrong password give the same message ("Email or password is incorrect") so strangers cannot discover which emails are registered. Login does the same hashing work either way to avoid timing leaks.
4. Passwords must be 8 to 72 characters, duplicate emails are rejected (409), and login and register are rate limited.
Not built: email or SMS verification codes, password reset, and sign-in lockout after repeated failures.

## Guest booking
- `POST /api/appointments/guest` books without an account. It requires name, phone (international format), explicit consent, and optionally email. Only services with `allow_guest = true` accept guests; providers choose this per service (`allowGuest` on `POST /api/provider/services`). Sample data: the dental checkup requires an account, other services allow guests.
- Guests get the same reminders (SMS, plus email if given) and a cancel link. The provider sees the guest's name and phone only for their own bookings.
- Abuse limits: 10 guest bookings per IP per hour and at most 2 upcoming guest bookings per phone number. Not built: phone verification by one-time code (a guest can type any number), so a provider can still receive a fake booking. Add SMS OTP before allowing guests on anything high-risk.

## Cookies, error pages, API models (latest)
- Sessions: login sets an HttpOnly `ot_session` cookie plus a readable `ot_csrf` cookie; POSTs must echo it in `X-CSRF-Token`. The login response no longer contains a token. Set `APP_URL` (the frontend origin) and run behind HTTPS in production so cookies are Secure.
- Error pages: `/errors/200|301|400|401|403|404|500` serve styled pages with the real HTTP status; unknown URLs get the 404 page; `/api/*` errors are JSON `{error,status,details?}`. React has the same pages (`#error-404` etc.).
- Request and response models: `backend/src/schemas.ts`, mirrored in `frontend/src/types.ts`, documented per endpoint in `docs/API.md`.
- Nearby places: the React list has "Use my location" and Directions links; the preview adds a schematic map. The map tiles of a real map (e.g. Leaflet) are not included.

## Languages, location-first results, responsive layout (latest)
- Preview UI languages: English, हिन्दी, ಕನ್ನಡ, தமிழ், తెలుగు, മലയാളം, मराठी, বাংলা, اردو (right-to-left), Español. Core screens are translated (navigation, sign-in, search, location, places, categories); deeper booking and profile text is still English. Dates, times, numbers and currency follow the chosen language. The first visit suggests the browser's language.
- Any other language Google Translate supports: `GET /api/i18n/:lang` machine-translates the English strings (`backend/data/i18n-en.json`) and caches the result. Needs `GOOGLE_TRANSLATE_API_KEY`; tested only with Google's reply simulated. Machine translations should be reviewed by a native speaker before launch.
- Places appear only after the person allows live location (preview and React app). Then: Best for you, Popular near you (within 10 km), Other regions (farther). Without a Google key only the saved Anekal snapshot exists, so "all shops" needs `GOOGLE_PLACES_API_KEY`.
- Layout: phone (bottom navigation), tablet (top bar), desktop (sidebar plus sticky map). Checked in a real headless Chromium at 390, 820 and 1440 px wide: no horizontal scrolling.
