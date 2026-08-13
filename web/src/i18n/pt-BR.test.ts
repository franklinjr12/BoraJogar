import { afterEach, describe, expect, it } from 'vitest';
import { formatDate } from './pt-BR';

afterEach(() => localStorage.clear());

describe('date formatting', () => {
  it('uses the player timezone saved in the profile', () => {
    localStorage.setItem('borajogar_timezone', 'America/Sao_Paulo');
    const formatted = formatDate('2026-01-01T00:00:00Z', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
    expect(formatted).toContain('31/12/2025');
  });

  it('ignores an invalid saved timezone', () => {
    localStorage.setItem('borajogar_timezone', 'not/a-timezone');
    expect(() => formatDate('2026-01-01T00:00:00Z', { dateStyle: 'short' })).not.toThrow();
  });
});
