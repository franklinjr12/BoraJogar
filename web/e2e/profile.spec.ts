import { test, expect, prepareAccount } from './support';

test.describe('Profile screen', () => {
  test('protects profile data when signed out', async ({ page }) => {
    await page.goto('/profile');

    await expect(page.getByText(/entre para ver seu perfil/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /entrar/i })).toHaveAttribute('href', '/login');
  });

  test('edits a profile and persists the change after reload', async ({ page }, testInfo) => {
    const prepared = await prepareAccount(page, testInfo, 'Profile');
    await page.goto('/profile');

    await expect(page.getByRole('heading', { name: prepared.account.displayName })).toBeVisible();
    await page.getByRole('button', { name: /editar perfil/i }).click();
    await page.getByLabel(/nome exibido/i).fill(`${prepared.account.displayName} Updated`);
    await page.getByLabel(/biografia/i).fill('Perfil atualizado no navegador.');
    await page.getByRole('button', { name: /salvar alterações/i }).click();

    await expect(page.getByRole('heading', { name: /updated$/i })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: /updated$/i })).toBeVisible();
  });

  test('signs out from profile', async ({ page }, testInfo) => {
    await prepareAccount(page, testInfo, 'Profile logout');
    await page.goto('/profile');
    await page.getByRole('button', { name: /^sair$/i }).click();

    await expect(page).toHaveURL(/\/login$/);
  });
});
