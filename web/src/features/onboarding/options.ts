import type { PlayingStyle, Profile, SkillLevel } from '../../api/client';
import { getDeviceTimeZone } from '../../platform/timeZone';
import { skillDescriptions, skillLabels, styleLabels } from '../../i18n/pt-BR';

export const skills: Array<{ value: SkillLevel; label: string; description: string }> = [
  {
    value: 'learning',
    label: skillLabels.learning,
    description: skillDescriptions.learning,
  },
  {
    value: 'beginner',
    label: skillLabels.beginner,
    description: skillDescriptions.beginner,
  },
  {
    value: 'intermediate',
    label: skillLabels.intermediate,
    description: skillDescriptions.intermediate,
  },
  {
    value: 'advanced',
    label: skillLabels.advanced,
    description: skillDescriptions.advanced,
  },
  {
    value: 'competitive',
    label: skillLabels.competitive,
    description: skillDescriptions.competitive,
  },
];

export const styles: Array<{ value: PlayingStyle; label: string }> = [
  { value: 'mixed', label: styleLabels.mixed },
  { value: 'casual', label: styleLabels.casual },
  { value: 'competitive', label: styleLabels.competitive },
  { value: 'training_focused', label: styleLabels.training_focused },
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
