import { test, expect, signIn } from './support';

test.describe('Games list screen', () => {
  test('lists future games and links to game creation', async ({ page }) => {
    await signIn(page, 'ana');
    await page.goto('/games');

    await expect(page.getByRole('heading', { name: /vamos jogar/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'E2E Open Game' })).toBeVisible();
    await expect(page.getByRole('link', { name: /criar uma partida/i }).first()).toHaveAttribute(
      'href',
      '/games/new',
    );
  });

  test('keeps protected game data unavailable when signed out', async ({ page }) => {
    await page.goto('/games');

    await expect(page.getByRole('heading', { name: /vamos jogar/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'E2E Open Game' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /criar uma partida/i }).first()).toHaveAttribute(
      'href',
      '/games/new',
    );
  });
});
