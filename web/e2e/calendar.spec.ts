import { test, expect, signIn } from './support';

test.describe('Calendar screen', () => {
  test('switches calendar views and filters confirmed games', async ({ page }) => {
    await signIn(page, 'ana');
    await page.goto('/calendar');

    await expect(page.getByRole('heading', { name: /seu calendário/i })).toBeVisible();
    await expect(page.getByText('E2E Open Game')).toBeVisible();
    await page.getByRole('button', { name: 'Mês', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Mês', exact: true })).toHaveClass(/selected/);
    await page.getByLabel('Filtro').selectOption('confirmed');
    await expect(page.getByText('E2E Open Game')).toBeVisible();
  });

  test('exposes calendar download links for active games', async ({ page }) => {
    await signIn(page, 'ana');
    await page.goto('/calendar');

    await expect(
      page.getByRole('link', { name: /adicionar ao calendário/i }).first(),
    ).toHaveAttribute('href', /\/api\/v1\/games\/[0-9a-f-]+\/calendar\.ics/);
  });
});
