import { z } from 'zod';
// REQUEST models: validated on the server for every route (never trust the client). RESPONSE models: the shapes the API returns (used by the frontend and docs/API.md).
export const PHONE = /^\+[1-9]\d{7,14}$/;
const phone = z.string().regex(PHONE, 'Use international format, e.g. +919876543210');
export const Register = z.object({ email: z.string().email().max(254), password: z.string().min(8).max(72), name: z.string().min(1), role: z.enum(['customer', 'provider']), businessName: z.string().optional(), city: z.string().optional() });
export const Login = z.object({ email: z.string(), password: z.string().max(72) });
export const PlacesQuery = z.object({ q: z.string().max(80).default(''), category: z.string().max(40).default(''), lat: z.coerce.number().min(-90).max(90).optional(), lng: z.coerce.number().min(-180).max(180).optional() });
export const CreateAppointment = z.object({ serviceId: z.string().uuid(), start: z.string(), staffId: z.string().uuid().optional(), idempotencyKey: z.string().min(8).max(100) });
export const GuestAppointment = CreateAppointment.extend({ name: z.string().trim().min(2).max(80), phone, email: z.string().email().max(254).optional(), consent: z.literal(true, { errorMap: () => ({ message: 'Consent to share details is required' }) }) });
export const NotifySettings = z.object({ phone: phone.nullable(), channels: z.array(z.enum(['email', 'sms', 'whatsapp', 'voice'])).min(1), locationConsent: z.boolean() });
export const Coords = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
export const ProviderService = z.object({ name: z.string().min(1), categoryId: z.number().int().optional(), durationMin: z.number().int().positive(), bufferMin: z.number().int().min(0).default(0), priceCents: z.number().int().min(0), allowGuest: z.boolean().default(true) });
export const ProviderStaff = z.object({ name: z.string().min(1), serviceIds: z.array(z.string().uuid()) });
export const ProviderAvailability = z.object({ staffId: z.string().uuid(), weekday: z.number().int().min(0).max(6), start: z.string().regex(/^\d\d:\d\d$/), end: z.string().regex(/^\d\d:\d\d$/) });
export type RegisterReq = z.infer<typeof Register>; export type CreateAppointmentReq = z.infer<typeof CreateAppointment>; export type GuestAppointmentReq = z.infer<typeof GuestAppointment>;
// ---- responses ----
export interface ApiError { error: string; status: number; details?: unknown }
export interface UserDTO { id: string; name: string; email?: string; role: 'customer' | 'provider' | 'admin' }
export interface SlotDTO { start: string; staff_id: string }
export interface AppointmentDTO { id: string; reference: string; cancel_token: string; status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'; price_cents: number; start: string; service: string; provider: string }
export interface PlaceDTO { id: string; name: string; category: string; rating: number | null; ratings: number; phone: string | null; hours: string; address: string; lat: number; lng: number; km?: number; source: 'google' | 'snapshot'; onboarded: false }
export interface PlacesRes { mode: 'google' | 'snapshot'; results: PlaceDTO[] }
