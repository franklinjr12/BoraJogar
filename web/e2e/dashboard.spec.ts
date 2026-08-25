import { test, expect, signIn } from './support';

test.describe('Dashboard screen', () => {
  test('shows the next game, availability summary, and creation actions', async ({ page }) => {
    await signIn(page, 'ana');
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: /que bom ver você, ana/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /sua próxima partida/i })).toBeVisible();
    await expect(page.getByText('E2E Praia Paulista', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /criar uma partida/i }).first()).toHaveAttribute(
      'href',
      '/games/new',
    );
  });

  test('shows setup guidance for an incomplete user', async ({ page }) => {
    await signIn(page, 'carla');
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: /que bom ver você, carla/i })).toBeVisible();
  });
});
