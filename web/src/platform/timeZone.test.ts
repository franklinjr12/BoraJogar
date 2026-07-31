import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDeviceTimeZone } from './timeZone';

describe('getDeviceTimeZone', () => {
  afterEach(() => vi.restoreAllMocks());

  it('falls back to Brasilia time when device timezone is unavailable', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(
      () => ({ resolvedOptions: () => ({ timeZone: '' }) }) as Intl.DateTimeFormat,
    );

    expect(getDeviceTimeZone()).toBe('America/Sao_Paulo');
  });
});
