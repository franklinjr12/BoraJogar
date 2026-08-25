import { test, expect, prepareAccount } from './support';

test.describe('Safety screen', () => {
  test('lists and unblocks a player', async ({ page }, testInfo) => {
    await prepareAccount(page, testInfo, 'Safety');
    await page.request.post('/api/v1/users/10000000-0000-0000-0000-000000000002/block');
    await page.goto('/settings/safety');

    await expect(page.getByRole('heading', { name: /controle suas interações/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Bruno Costa' })).toBeVisible();
    await page.getByRole('button', { name: /desbloquear/i }).click();

    await expect(page.getByText(/nenhum jogador bloqueado/i)).toBeVisible();
  });
});
