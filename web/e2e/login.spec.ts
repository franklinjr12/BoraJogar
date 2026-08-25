import { test, expect, uniqueEmail, uniqueSuffix } from './support';

test.describe('Login screen', () => {
  test('switches between sign-up and login forms and toggles password visibility', async ({
    page,
  }) => {
    await page.goto('/login');

    await expect(page.getByRole('tab', { name: 'Criar conta' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByLabel(/nome exibido/i)).toBeVisible();
    await page.getByRole('tab', { name: 'Entrar' }).click();
    await expect(page.getByLabel(/nome exibido/i)).toHaveCount(0);

    const password = page.getByLabel(/senha/i);
    await expect(password).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: /mostrar valor digitado/i }).click();
    await expect(password).toHaveAttribute('type', 'text');
  });

  test('creates an email account, logs out, and logs back in', async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo, 'login');
    const password = 'pw';
    const displayName = `Login ${uniqueSuffix(testInfo).slice(-8)}`;

    await page.goto('/login');
    await page.getByLabel(/nome exibido/i).fill(displayName);
    await page.getByLabel(/e-mail/i).fill(email);
    await page.getByLabel(/senha/i).fill(password);
    await page.getByRole('button', { name: /^criar conta$/i }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    await page.request.post('/api/v1/auth/logout');
    await page.goto('/login');
    await page.getByRole('tab', { name: 'Entrar' }).click();
    await page.getByLabel(/e-mail/i).fill(email);
    await page.getByLabel(/senha/i).fill(password);
    await page.getByRole('button', { name: /^entrar$/i }).click();

    await expect(page).toHaveURL(/\/onboarding$/);
  });

  test('preserves safe return paths in the Google login link', async ({ page }) => {
    await page.goto('/login?invite=invite-code&returnTo=%2Fgames%2Fgame-1');

    await expect(page.getByText(/código de convite pronto/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /continuar com o google/i })).toHaveAttribute(
      'href',
      /invitation=invite-code.*returnTo=%2Fgames%2Fgame-1/,
    );
  });
});
