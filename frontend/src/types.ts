// Response shapes returned by the API (mirror of backend/src/schemas.ts). Use these instead of `any`.
export interface ApiError { error: string; status: number; details?: unknown }
export interface UserDTO { id: string; name: string; email?: string; role: 'customer' | 'provider' | 'admin' }
export interface PlaceDTO { id: string; name: string; category: string; rating: number | null; ratings: number; phone: string | null; hours: string; address: string; lat: number; lng: number; km?: number; source: 'google' | 'snapshot'; onboarded: false }
export interface PlacesRes { mode: 'google' | 'snapshot'; results: PlaceDTO[] }
