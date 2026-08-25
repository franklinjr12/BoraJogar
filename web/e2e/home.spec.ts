import { test, expect, signIn } from './support';

test.describe('Home screen', () => {
  test('shows the signed-out value proposition and start action', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /encontre pessoas para jogar/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /começar/i })).toHaveAttribute('href', '/start');
    await expect(page.getByRole('link', { name: /já tem uma conta/i })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  test('redirects an authenticated user to the dashboard', async ({ page }) => {
    await signIn(page, 'ana');
    await page.goto('/');

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: /que bom ver você, ana/i })).toBeVisible();
  });
});
