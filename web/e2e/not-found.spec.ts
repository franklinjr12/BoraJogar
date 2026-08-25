import { test, expect } from './support';

test.describe('Not-found screen', () => {
  test('renders fallback for unknown routes', async ({ page }) => {
    await page.goto('/route-that-does-not-exist');

    await expect(page.getByRole('heading', { name: /página não encontrada/i })).toBeVisible();
    await expect(page.getByText(/próxima etapa/i)).toBeVisible();
  });
});
