import type { PlayingStyle, Profile, SkillLevel } from '../../api/client';
import { getDeviceTimeZone } from '../../platform/timeZone';

export const skills: Array<{ value: SkillLevel; label: string; description: string }> = [
  {
    value: 'learning',
    label: 'Learning',
    description: "I'm still learning the fundamentals.",
  },
  {
    value: 'beginner',
    label: 'Beginner',
    description: "I understand the game but I'm still inconsistent.",
  },
  {
    value: 'intermediate',
    label: 'Intermediate',
    description: 'I can pass, set, attack and position reliably.',
  },
  {
    value: 'advanced',
    label: 'Advanced',
    description: 'I play consistently and understand tactics well.',
  },
  {
    value: 'competitive',
    label: 'Competitive',
    description: 'I regularly play competitive games or tournaments.',
  },
];

export const styles: Array<{ value: PlayingStyle; label: string }> = [
  { value: 'mixed', label: 'No preference' },
  { value: 'casual', label: 'Casual' },
  { value: 'competitive', label: 'Competitive' },
  { value: 'training_focused', label: 'Training-focused' },
];

export const blankProfile: Omit<Profile, 'userId' | 'avatarUrl'> = {
  displayName: '',
  timeZone: getDeviceTimeZone(),
  skillLevel: 'beginner',
  bio: '',
  styles: ['mixed'],
  preferredGameDurationMinutes: 90,
  minimumNoticeMinutes: 120,
  activeForMatchmaking: true,
};
