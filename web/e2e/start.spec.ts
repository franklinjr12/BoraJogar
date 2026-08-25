import { test, expect } from './support';

test.describe('Start screen', () => {
  test('routes each anonymous goal through the correct authentication return path', async ({
    page,
  }) => {
    await page.goto('/start');

    await expect(page.getByRole('link', { name: /encontrar pessoas para jogar/i })).toHaveAttribute(
      'href',
      '/login?returnTo=/onboarding',
    );
    await expect(page.getByRole('link', { name: /criar uma partida/i })).toHaveAttribute(
      'href',
      '/login?returnTo=/onboarding?goal=create_game',
    );
    await expect(page.getByRole('link', { name: /entrar em uma partida/i })).toHaveAttribute(
      'href',
      '/login?returnTo=/onboarding?goal=join_game',
    );
  });

  test('saves selected goal before navigating', async ({ page }) => {
    await page.goto('/start');
    await page.getByRole('link', { name: /criar uma partida/i }).click();

    await expect(page).toHaveURL(/\/login\?returnTo=\/onboarding\?goal=create_game$/);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('borajogar_onboarding_goal')))
      .toBe('create_game');
  });
});
