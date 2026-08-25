import { test, expect, signIn } from './support';

test.describe('Proposal screen', () => {
  test('explains that proposal review is not available yet', async ({ page }) => {
    await signIn(page, 'ana');
    await page.goto('/proposals/90000000-0000-0000-0000-000000000001');

    await expect(page.getByRole('heading', { name: /esta proposta ainda/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /voltar aos avisos/i })).toHaveAttribute(
      'href',
      '/notifications',
    );
  });
});
