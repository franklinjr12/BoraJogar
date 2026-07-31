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
  id: string;
  name: string;
  description?: string;
  addressLabel?: string;
  city: string;
  latitude: number;
  longitude: number;
  lightingStatus: LightingStatus;
  surfaceType: string;
  accessType: AccessType;
  active: boolean;
  distanceMeters?: number;
}
export interface PreferredArea {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  priority: number;
  active: boolean;
}
export interface AvailabilityRule {
  id: string;
  weekday: number;
  start: string;
  end: string;
  timezone: string;
  validFrom: string;
  validUntil?: string;
  active: boolean;
  venueIds: string[];
  preferredAreaIds: string[];
}
export interface AvailabilityException {
  id: string;
  date: string;
  type: 'unavailable_all_day' | 'unavailable_interval' | 'available_interval';
  start?: string;
  end?: string;
  timezone: string;
}
export interface AvailabilityOccurrence {
  startsAt: string;
  endsAt: string;
  sourceType: string;
  sourceId: string;
}
export type GameSkillLevel = SkillLevel;
export type GameVisibility = 'public' | 'link-only' | 'private';
export interface Game {
  id: string;
  title?: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  venueId: string;
  venueName: string;
  addressLabel?: string;
  latitude: number;
  longitude: number;
  capacity: number;
  confirmedPlayers: number;
  openSlots: number;
  minimumSkillLevel: GameSkillLevel;
  maximumSkillLevel: GameSkillLevel;
  visibility: GameVisibility;
  status: 'scheduled' | 'cancelled' | 'completed';
  organizer?: { id: string; displayName: string };
  players?: Array<{ id: string; displayName: string; role?: string }>;
  waitlist?: Array<{ id: string; displayName: string }>;
  isMember?: boolean;
  currentUserStatus?: string;
  currentUserRole?: string;
  shareUrl?: string;
}
export interface GameInput {
  startsAt: string;
  durationMinutes: 60 | 90 | 120;
  venueId: string;
  capacity: number;
  minimumSkillLevel: GameSkillLevel;
  maximumSkillLevel: GameSkillLevel;
  visibility: GameVisibility;
  title?: string;
  description?: string;
}
export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  actionUrl?: string;
  payload: Record<string, unknown>;
  readAt?: string;
  createdAt: string;
}
export interface NotificationPage {
  items: Notification[];
  unreadCount: number;
  hasMore: boolean;
  page: number;
  pageSize: number;
}

export interface PublicProfile {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  skillLevel: SkillLevel;
  bio?: string;
  styles: PlayingStyle[];
  completedGames: number;
  playedTogether: boolean;
}

export interface BlockedUser {
  userId: string;
  displayName: string;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  fields: Record<string, string>;
}

export interface AuthResult {
  redirectTo: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;
  readonly requestId?: string;

  constructor(status: number, payload: ApiErrorPayload, requestId?: string) {
    super(payload.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload.code;
    this.fields = payload.fields;
    this.requestId = requestId;
  }
}

interface ErrorResponse {
  error?: Partial<ApiErrorPayload>;
  requestId?: string;
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  return typeof value === 'object' && value !== null && ('error' in value || 'requestId' in value);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'include',
      ...init,
      headers,
      signal: init?.signal ?? controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = isErrorResponse(body) ? body.error : undefined;
    throw new ApiError(
      response.status,
      {
        code: error?.code ?? `http_${response.status}`,
        message: error?.message ?? `Request failed with status ${response.status}.`,
        fields: error?.fields ?? {},
      },
      isErrorResponse(body) ? body.requestId : (response.headers.get('X-Request-ID') ?? undefined),
    );
  }
  return body as T;
}

export const profileApi = {
  get: async () => {
    const profile = await request<Profile | undefined>('/api/v1/me/profile');
    if (!profile) throw new Error('Profile response was empty.');
    return profile;
  },
  update: (profile: Omit<Profile, 'userId' | 'avatarUrl'>) =>
    request<Profile>('/api/v1/me/profile', { method: 'PUT', body: JSON.stringify(profile) }),
  saveProgress: (currentStep: number, completedSteps: number[]) =>
    request('/api/v1/me/onboarding', {
      method: 'PUT',
      body: JSON.stringify({ currentStep, completedSteps }),
    }),
  complete: () => request<void>('/api/v1/me/onboarding/complete', { method: 'POST' }),
};

export const authApi = {
  emailSignup: (input: { email: string; password: string; displayName?: string }) =>
    request<AuthResult>('/api/v1/auth/email/signup', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  emailLogin: (input: { email: string; password: string }) =>
    request<AuthResult>('/api/v1/auth/email/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};

export const userApi = {
  publicProfile: (userId: string) =>
    request<PublicProfile>(`/api/v1/users/${encodeURIComponent(userId)}/public-profile`),
  blockedUsers: () => request<BlockedUser[]>('/api/v1/me/blocked-users'),
  block: (userId: string) =>
    request<void>(`/api/v1/users/${encodeURIComponent(userId)}/block`, { method: 'POST' }),
  unblock: (userId: string) =>
    request<void>(`/api/v1/users/${encodeURIComponent(userId)}/block`, { method: 'DELETE' }),
};

export const locationApi = {
  venues: (position?: { latitude: number; longitude: number }) => {
    const params = new URLSearchParams({ city: 'São Paulo' });
    if (position) {
      params.set('latitude', String(position.latitude));
      params.set('longitude', String(position.longitude));
    }
    return request<Venue[]>(`/api/v1/venues?${params.toString()}`);
  },
  preferredAreas: () => request<PreferredArea[]>('/api/v1/me/preferred-areas'),
  createPreferredArea: (input: Omit<PreferredArea, 'id' | 'active'>) =>
    request<PreferredArea>('/api/v1/me/preferred-areas', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  deletePreferredArea: (id: string) =>
    request<void>(`/api/v1/me/preferred-areas/${id}`, { method: 'DELETE' }),
  favoriteVenues: () => request<Venue[]>('/api/v1/me/favorite-venues'),
  favoriteVenue: (id: string) =>
    request<void>(`/api/v1/me/favorite-venues/${id}`, { method: 'POST' }),
  unfavoriteVenue: (id: string) =>
    request<void>(`/api/v1/me/favorite-venues/${id}`, { method: 'DELETE' }),
};

export const availabilityApi = {
  rules: async () => {
    const rules = await request<AvailabilityRule[] | undefined>('/api/v1/me/availability/rules');
    return Array.isArray(rules) ? rules : [];
  },
  createRule: (input: Omit<AvailabilityRule, 'id'>) =>
    request<AvailabilityRule>('/api/v1/me/availability/rules', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  deleteRule: (id: string) =>
    request<void>(`/api/v1/me/availability/rules/${id}`, { method: 'DELETE' }),
  exceptions: () => request<AvailabilityException[]>('/api/v1/me/availability/exceptions'),
  createException: (input: Omit<AvailabilityException, 'id'>) =>
    request<AvailabilityException>('/api/v1/me/availability/exceptions', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  deleteException: (id: string) =>
    request<void>(`/api/v1/me/availability/exceptions/${id}`, { method: 'DELETE' }),
  calendar: (from: string, to: string) =>
    request<AvailabilityOccurrence[]>(`/api/v1/me/availability/calendar?from=${from}&to=${to}`),
};

export const gameApi = {
  list: (includeCancelled = false, page = 1, pageSize = 30) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (includeCancelled) params.set('includeCancelled', 'true');
    return request<Page<Game>>(`/api/v1/games?${params.toString()}`);
  },
  get: (id: string, access?: string) =>
    request<Game>(`/api/v1/games/${id}${access ? `?access=${encodeURIComponent(access)}` : ''}`),
  create: (input: GameInput) =>
    request<Game>('/api/v1/games', { method: 'POST', body: JSON.stringify(input) }),
  join: (id: string) =>
    request<{ result: 'confirmed' | 'waitlisted' }>(`/api/v1/games/${id}/join`, { method: 'POST' }),
  leave: (id: string) =>
    request<{ result: string }>(`/api/v1/games/${id}/leave`, { method: 'POST' }),
  calendarURL: (id: string, access?: string) =>
    `/api/v1/games/${id}/calendar.ics${access ? `?access=${encodeURIComponent(access)}` : ''}`,
};

export const notificationApi = {
  list: (page = 1, pageSize = 30) =>
    request<NotificationPage>(`/api/v1/notifications?page=${page}&pageSize=${pageSize}`),
  markRead: (id: string) => request<void>(`/api/v1/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => request<void>('/api/v1/notifications/read-all', { method: 'POST' }),
};
