export type SkillLevel = 'learning' | 'beginner' | 'intermediate' | 'advanced' | 'competitive';
import { apiErrorMessage } from '../i18n/pt-BR';
import { captureClientError } from '../platform/errorReporting';

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
export interface GoogleMapsConfig {
  googleMapsApiKey: string;
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
interface AvailabilityRuleWire {
  id?: unknown;
  weekday?: unknown;
  start?: unknown;
  Start?: unknown;
  end?: unknown;
  End?: unknown;
  timezone?: unknown;
  Timezone?: unknown;
  validFrom?: unknown;
  ValidFrom?: unknown;
  validUntil?: unknown;
  ValidUntil?: unknown;
  active?: unknown;
  venueIds?: unknown;
  preferredAreaIds?: unknown;
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
export type GameCurrentUserStatus = '' | 'confirmed' | 'waitlisted' | 'cancelled' | 'removed';
export interface GameConfirmation {
  enabled: boolean;
  confirmedCount: number;
  totalPlayers: number;
}
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
  waitlistEnabled: boolean;
  waitlistSize: number;
  waitlistCount: number;
  minimumSkillLevel: GameSkillLevel;
  maximumSkillLevel: GameSkillLevel;
  visibility: GameVisibility;
  status: 'scheduled' | 'cancelled' | 'completed';
  organizer?: { id: string; displayName: string };
  players?: Array<{
    id: string;
    displayName: string;
    role?: string;
    status?: string;
    confirmationConfirmed?: boolean;
    isCurrentUser?: boolean;
  }>;
  waitlist?: Array<{ id: string; displayName: string }>;
  confirmation?: GameConfirmation;
  isMember?: boolean;
  currentUserStatus?: GameCurrentUserStatus;
  currentUserRole?: string;
  shareUrl?: string;
}
export interface GameChatMessage {
  id: string;
  gameId: string;
  userId: string;
  displayName: string;
  body: string;
  createdAt: string;
}
export interface GameChatPage {
  items: GameChatMessage[];
  hasMore: boolean;
  nextCursor: string | null;
  pageSize: 20;
}
export interface GameInput {
  startsAt: string;
  durationMinutes: 60 | 90 | 120;
  venueId: string;
  capacity: number;
  waitlistEnabled: boolean;
  waitlistSize: number;
  confirmationEnabled: boolean;
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
  actionUrl: string | null;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}
export interface NotificationPage {
  items: Notification[];
  unreadCount: number;
  hasMore: boolean;
  page: number;
  pageSize: number;
}

export type AttendanceStatus = 'unknown' | 'attended' | 'no_show';
export interface AttendanceEntry {
  userId: string;
  displayName: string;
  status: AttendanceStatus;
  recordedAt?: string;
}
export interface ReliabilitySummary {
  gamesConfirmed: number;
  gamesAttended: number;
  earlyCancellations: number;
  lateCancellations: number;
  noShows: number;
  sufficientHistory: boolean;
  matchmakingValue: number;
}
export interface ReportInput {
  reportedUserId?: string;
  gameId?: string;
  category:
    | 'harassment'
    | 'unsafe_behavior'
    | 'repeated_no_show'
    | 'false_profile'
    | 'inappropriate_content'
    | 'other';
  description: string;
  blockReportedUser: boolean;
}
export interface ReportResult {
  id: string;
  status: string;
}
export interface BlockedUser {
  userId: string;
  displayName: string;
  createdAt: string;
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
export interface CurrentUser {
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
  timeZone: string;
  onboardingComplete: boolean;
  isAdmin: boolean;
}
export interface OnboardingReadiness {
  profile: boolean;
  location: boolean;
  availability: boolean;
  profileCount: number;
  favoriteVenueCount: number;
  preferredAreaCount: number;
  availabilityCount: number;
  canComplete: boolean;
  missing: string[];
}
export interface AvailabilitySummary {
  id: string;
  weekday: number;
  start: string;
  end: string;
  labels: string[];
}
export type GamePreview = Pick<
  Game,
  | 'id'
  | 'title'
  | 'startsAt'
  | 'endsAt'
  | 'venueName'
  | 'addressLabel'
  | 'latitude'
  | 'longitude'
  | 'capacity'
  | 'confirmedPlayers'
  | 'openSlots'
  | 'waitlistEnabled'
  | 'waitlistSize'
  | 'waitlistCount'
  | 'minimumSkillLevel'
  | 'maximumSkillLevel'
  | 'visibility'
  | 'status'
>;
export interface Dashboard {
  displayName: string;
  readiness: OnboardingReadiness;
  nextGame?: Game;
  openGames: Game[];
  availabilitySummary: AvailabilitySummary[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;
  readonly requestId?: string;

  constructor(status: number, payload: ApiErrorPayload, requestId?: string) {
    super(apiErrorMessage(payload.code));
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
  const requestMethod = (init?.method ?? 'GET').toUpperCase();
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
  } catch (error) {
    captureClientError('api_error', error, { requestMethod, requestPath: path });
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
  if (response.status === 204) return undefined as T;
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    captureClientError('api_error', error, {
      requestMethod,
      requestPath: path,
      statusCode: response.status,
    });
    if (response.ok) throw error;
  }
  if (!response.ok) {
    const error = isErrorResponse(body) ? body.error : undefined;
    const apiError = new ApiError(
      response.status,
      {
        code: error?.code ?? `http_${response.status}`,
        message: error?.message ?? `http_${response.status}`,
        fields: error?.fields ?? {},
      },
      isErrorResponse(body) ? body.requestId : (response.headers.get('X-Request-ID') ?? undefined),
    );
    captureClientError('api_error', apiError, {
      requestMethod,
      requestPath: path,
      requestId: apiError.requestId,
      statusCode: response.status,
    });
    throw apiError;
  }
  return body as T;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function normalizeAvailabilityRule(value: unknown): AvailabilityRule | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const rule = value as AvailabilityRuleWire;
  const start = rule.start ?? rule.Start;
  const end = rule.end ?? rule.End;
  const timezone = rule.timezone ?? rule.Timezone;
  const validFrom = rule.validFrom ?? rule.ValidFrom;
  if (
    typeof rule.id !== 'string' ||
    typeof rule.weekday !== 'number' ||
    typeof start !== 'string' ||
    typeof end !== 'string' ||
    typeof timezone !== 'string' ||
    typeof validFrom !== 'string'
  ) {
    return undefined;
  }
  const validUntil = rule.validUntil ?? rule.ValidUntil;
  return {
    id: rule.id,
    weekday: rule.weekday,
    start,
    end,
    timezone,
    validFrom,
    ...(typeof validUntil === 'string' ? { validUntil } : {}),
    active: typeof rule.active === 'boolean' ? rule.active : true,
    venueIds: asStringArray(rule.venueIds),
    preferredAreaIds: asStringArray(rule.preferredAreaIds),
  };
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
  readiness: () => request<OnboardingReadiness>('/api/v1/me/onboarding/readiness'),
  complete: () => request<void>('/api/v1/me/onboarding/complete', { method: 'POST' }),
};

export const authApi = {
  currentUser: () => request<CurrentUser>('/api/v1/me'),
  logout: () => request<void>('/api/v1/auth/logout', { method: 'POST' }),
  deleteAccount: () => request<void>('/api/v1/me/delete', { method: 'POST' }),
  emailSignup: (input: {
    email: string;
    password: string;
    displayName?: string;
    returnTo?: string;
  }) =>
    request<AuthResult>('/api/v1/auth/email/signup', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  emailLogin: (input: { email: string; password: string; returnTo?: string }) =>
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
  mapsConfig: () => request<GoogleMapsConfig>('/api/v1/me/maps-config'),
  venues: (position?: { latitude: number; longitude: number }) => {
    const params = new URLSearchParams({ city: 'Curitiba' });
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
  createVenue: (
    input: Pick<Venue, 'name' | 'city' | 'latitude' | 'longitude'> &
      Partial<
        Pick<
          Venue,
          'description' | 'addressLabel' | 'lightingStatus' | 'surfaceType' | 'accessType'
        >
      >,
  ) =>
    request<Venue>('/api/v1/me/venues', {
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
    const rules = await request<unknown[] | undefined>('/api/v1/me/availability/rules');
    return Array.isArray(rules)
      ? rules
          .map(normalizeAvailabilityRule)
          .filter((rule): rule is AvailabilityRule => Boolean(rule))
      : [];
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
  preview: (id: string, access?: string) =>
    request<GamePreview>(
      `/api/v1/games/${id}/preview${access ? `?access=${encodeURIComponent(access)}` : ''}`,
    ),
  create: (input: GameInput) =>
    request<Game>('/api/v1/games', { method: 'POST', body: JSON.stringify(input) }),
  join: (id: string) =>
    request<{ result: 'confirmed' | 'waitlisted' }>(`/api/v1/games/${id}/join`, { method: 'POST' }),
  joinWaitlist: (id: string) =>
    request<{ result: 'confirmed' | 'waitlisted' }>(`/api/v1/games/${id}/waitlist`, {
      method: 'POST',
    }),
  leaveWaitlist: (id: string) =>
    request<void>(`/api/v1/games/${id}/waitlist`, { method: 'DELETE' }),
  setConfirmation: (id: string, confirmed: boolean) =>
    request<void>(`/api/v1/games/${encodeURIComponent(id)}/confirmation`, {
      method: 'PUT',
      body: JSON.stringify({ confirmed }),
    }),
  leave: (id: string) =>
    request<{ result: string }>(`/api/v1/games/${id}/leave`, { method: 'POST' }),
  cancel: (id: string) => request<void>(`/api/v1/games/${id}/cancel`, { method: 'POST' }),
  removePlayer: (gameId: string, userId: string) =>
    request<{ result: 'removed' }>(
      `/api/v1/games/${encodeURIComponent(gameId)}/players/${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    ),
  calendarURL: (id: string, access?: string) =>
    `/api/v1/games/${id}/calendar.ics${access ? `?access=${encodeURIComponent(access)}` : ''}`,
  chat: (id: string, before?: string) => {
    const query = before ? `?before=${encodeURIComponent(before)}` : '';
    return request<GameChatPage>(`/api/v1/games/${encodeURIComponent(id)}/chat${query}`);
  },
  sendChatMessage: (id: string, body: string) =>
    request<GameChatMessage>(`/api/v1/games/${encodeURIComponent(id)}/chat`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
};

export const attendanceApi = {
  list: (gameId: string) =>
    request<AttendanceEntry[]>(`/api/v1/games/${encodeURIComponent(gameId)}/attendance`),
  record: (gameId: string, userId: string, status: AttendanceStatus) =>
    request<void>(`/api/v1/games/${encodeURIComponent(gameId)}/attendance`, {
      method: 'PUT',
      body: JSON.stringify({ userId, status }),
    }),
  reliability: () => request<ReliabilitySummary>('/api/v1/me/reliability'),
};

export const moderationApi = {
  report: (input: ReportInput) =>
    request<ReportResult>('/api/v1/reports', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};

export const dashboardApi = {
  get: () => request<Dashboard>('/api/v1/me/dashboard'),
};

export const notificationApi = {
  list: (page = 1, pageSize = 30) =>
    request<NotificationPage>(`/api/v1/notifications?page=${page}&pageSize=${pageSize}`),
  markRead: (id: string) => request<void>(`/api/v1/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => request<void>('/api/v1/notifications/read-all', { method: 'POST' }),
};
