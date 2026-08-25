import { test, expect, prepareAccount } from './support';

test.describe('Public profile screen', () => {
  test('views, blocks, unblocks, and reports another player', async ({ page }, testInfo) => {
    await prepareAccount(page, testInfo, 'Public profile');
    await page.goto('/players/10000000-0000-0000-0000-000000000002');

    await expect(page.getByRole('heading', { name: 'Bruno Costa' })).toBeVisible();
    await page.getByRole('button', { name: /^bloquear jogador$/i }).click();
    await expect(page.getByRole('heading', { name: /bloquear jogador/i })).toBeVisible();
    await page
      .getByRole('button', { name: /^bloquear jogador$/i })
      .last()
      .click();
    await expect(page.getByText(/jogador bloqueado/i)).toBeVisible();

    await page.getByRole('button', { name: /desbloquear jogador/i }).click();
    await expect(page.getByText(/jogador desbloqueado/i)).toBeVisible();

    await page.getByRole('button', { name: /relatar problema/i }).click();
    await page.getByLabel(/descreva o que aconteceu/i).fill('Relato criado pela cobertura E2E.');
    await page.getByRole('button', { name: /enviar relato/i }).click();
    await expect(page.getByText(/relato enviado/i)).toBeVisible();
  });
});
