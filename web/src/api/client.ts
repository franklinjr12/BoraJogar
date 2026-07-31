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
