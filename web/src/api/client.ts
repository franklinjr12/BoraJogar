export type SkillLevel = 'learning' | 'beginner' | 'intermediate' | 'advanced' | 'competitive';
export type PlayingStyle = 'casual' | 'competitive' | 'training_focused' | 'mixed';

export interface Profile {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  timeZone: string;
  skillLevel: SkillLevel;
  bio?: string;
  styles: PlayingStyle[];
  preferredGameDurationMinutes: 60 | 90 | 120;
  minimumNoticeMinutes: number;
  activeForMatchmaking: boolean;
}

export type LightingStatus = 'unknown' | 'no_lighting' | 'has_lighting';
export type AccessType = 'public' | 'private' | 'paid_entry' | 'unknown';
export interface Venue {
  id: string; name: string; description?: string; addressLabel?: string; city: string;
  latitude: number; longitude: number; lightingStatus: LightingStatus; surfaceType: string;
  accessType: AccessType; active: boolean; distanceMeters?: number;
}
export interface PreferredArea { id: string; label: string; latitude: number; longitude: number; radiusMeters: number; priority: number; active: boolean; }
export interface AvailabilityRule { id: string; weekday: number; start: string; end: string; timezone: string; validFrom: string; validUntil?: string; active: boolean; venueIds: string[]; preferredAreaIds: string[]; }
export interface AvailabilityException { id: string; date: string; type: 'unavailable_all_day' | 'unavailable_interval' | 'available_interval'; start?: string; end?: string; timezone: string; }
export interface AvailabilityOccurrence { startsAt: string; endsAt: string; sourceType: string; sourceId: string; }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.status === 204 ? (undefined as T) : (await response.json() as T);
}

export const profileApi = {
  get: () => request<Profile>('/api/v1/me/profile'),
  update: (profile: Omit<Profile, 'userId' | 'avatarUrl'>) => request<Profile>('/api/v1/me/profile', { method: 'PUT', body: JSON.stringify(profile) }),
  saveProgress: (currentStep: number, completedSteps: number[]) => request('/api/v1/me/onboarding', { method: 'PUT', body: JSON.stringify({ currentStep, completedSteps }) }),
  complete: () => request<void>('/api/v1/me/onboarding/complete', { method: 'POST' }),
};

export const locationApi = {
  venues: (position?: { latitude: number; longitude: number }) => {
    const params = new URLSearchParams({ city: 'São Paulo' });
    if (position) { params.set('latitude', String(position.latitude)); params.set('longitude', String(position.longitude)); }
    return request<Venue[]>(`/api/v1/venues?${params.toString()}`);
  },
  preferredAreas: () => request<PreferredArea[]>('/api/v1/me/preferred-areas'),
  createPreferredArea: (input: Omit<PreferredArea, 'id' | 'active'>) => request<PreferredArea>('/api/v1/me/preferred-areas', { method: 'POST', body: JSON.stringify(input) }),
  deletePreferredArea: (id: string) => request<void>(`/api/v1/me/preferred-areas/${id}`, { method: 'DELETE' }),
  favoriteVenues: () => request<Venue[]>('/api/v1/me/favorite-venues'),
  favoriteVenue: (id: string) => request<void>(`/api/v1/me/favorite-venues/${id}`, { method: 'POST' }),
  unfavoriteVenue: (id: string) => request<void>(`/api/v1/me/favorite-venues/${id}`, { method: 'DELETE' }),
};

export const availabilityApi = {
  rules: () => request<AvailabilityRule[]>('/api/v1/me/availability/rules'),
  createRule: (input: Omit<AvailabilityRule, 'id'>) => request<AvailabilityRule>('/api/v1/me/availability/rules', { method: 'POST', body: JSON.stringify(input) }),
  deleteRule: (id: string) => request<void>(`/api/v1/me/availability/rules/${id}`, { method: 'DELETE' }),
  exceptions: () => request<AvailabilityException[]>('/api/v1/me/availability/exceptions'),
  createException: (input: Omit<AvailabilityException, 'id'>) => request<AvailabilityException>('/api/v1/me/availability/exceptions', { method: 'POST', body: JSON.stringify(input) }),
  deleteException: (id: string) => request<void>(`/api/v1/me/availability/exceptions/${id}`, { method: 'DELETE' }),
  calendar: (from: string, to: string) => request<AvailabilityOccurrence[]>(`/api/v1/me/availability/calendar?from=${from}&to=${to}`),
};
