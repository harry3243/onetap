# OneTap API: what to use where

Request models are validated on the server (`backend/src/schemas.ts`). Response types live in the same file and are mirrored for the frontend in `frontend/src/types.ts`.

**Auth:** `POST /api/auth/login` sets two cookies. `ot_session` is HttpOnly, SameSite=Lax (Secure in production) and holds the login. `ot_csrf` is readable by the page, and every POST made with the session cookie must send its value in an `X-CSRF-Token` header, otherwise the server answers 403. Bearer tokens are also accepted for non-browser clients (no CSRF header needed).

**Errors:** every `/api/*` error is JSON `{ "error": string, "status": number, "details"?: any }`. Any other URL gets a styled HTML page with the same status. Preview all pages at `/errors/200`, `301`, `400`, `401`, `403`, `404`, `500`.

| Method and path | Who | Request model | Success response | Error statuses |
|---|---|---|---|---|
| POST /api/auth/register | public | `Register` (body) | 201 `{ user: UserDTO }` (no login) | 400, 409 |
| POST /api/auth/login | public | `Login` (body) | 200 `{ user: UserDTO }` + cookies | 400, 401 |
| POST /api/auth/logout | anyone | none | 200 `{ ok }` (clears cookies) | none |
| GET /api/auth/me | signed in | none | 200 `{ user: UserDTO }` | 401 |
| GET /api/categories | public | none | 200 `[{ id, parent_id, name, slug }]` | none |
| GET /api/search | public | `?q&category&city` | 200 `[{ id, name, city, verified, from_price }]` | 400 |
| GET /api/providers/:id | public | path id | 200 provider + `services[]` (includes `allow_guest`) | 404 |
| GET /api/services/:id/availability | public | `?date=YYYY-MM-DD` | 200 `SlotDTO[]` | 400 |
| POST /api/appointments | customer | `CreateAppointment` (body) | 201 appointment row | 400, 401, 403, 404, 409 |
| POST /api/appointments/guest | public | `GuestAppointment` (body) | 201 `{ reference, cancelToken, status }` | 400, 403, 404, 409, 429 |
| GET /api/appointments/mine | customer | none | 200 `AppointmentDTO[]` | 401, 403 |
| POST /api/appointments/:id/cancel | customer (owner) | none | 200 `{ ok }` | 401, 404, 409 |
| POST /api/appointments/:id/arrive | customer (owner) | `Coords` (body) | 200 `{ arrived, onTime?, minutesLate?, distanceM?, message }` | 400, 401, 403, 404, 409 |
| GET /api/appointments/ics/:token | link holder | path token | 200 `text/calendar` | 404 |
| GET, POST /api/appointments/cancel/:token | link holder | path token | HTML confirm page, then HTML result | 404, 409 |
| GET, POST /api/me/notify | signed in | `NotifySettings` (POST body) | 200 settings, or `{ ok }` | 400, 401 |
| GET /api/places | public | `PlacesQuery` (query) | 200 `PlacesRes` | 400 |
| POST /api/provider/services | provider | `ProviderService` | 201 service row | 400, 401, 403 |
| POST /api/provider/staff | provider | `ProviderStaff` | 201 staff row | 400, 401, 403 |
| POST /api/provider/availability | provider | `ProviderAvailability` | 201 rule row | 400, 401, 403, 404 |
| POST /api/provider/location | provider | `Coords` | 200 `{ ok }` | 400, 401, 403 |
| GET /api/provider/appointments | provider | none | 200 `[{ id, reference, status, start, service, staff, customer, phone, guest }]` | 401, 403 |

Status meanings used: 200 OK, 201 created, 301 moved (only for the `/errors/301` demo), 400 invalid input, 401 not signed in or wrong credentials, 403 signed in but not allowed (wrong role, missing CSRF token, account required), 404 not found, 409 conflict (slot taken, already cancelled), 429 rate limited, 500 server fault.
