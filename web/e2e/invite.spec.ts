import { test, expect } from './support';

test.describe('Invite screen', () => {
  test('redirects invite links to login with invitation code preserved', async ({ page }) => {
    await page.goto('/invite/e2e-invitation-code');

    await expect(page).toHaveURL(/\/login\?invite=e2e-invitation-code$/);
    await expect(page.getByText(/código de convite pronto/i)).toBeVisible();
  });
});
