import { test, expect, createGame, prepareAccount, signIn } from './support';

test.describe('Notifications screen', () => {
  test('shows a chat notification, opens its game, and marks it as read', async ({
    browser,
    page,
  }, testInfo) => {
    await prepareAccount(page, testInfo, 'Notification owner');
    const participantContext = await browser.newContext();
    const participantPage = await participantContext.newPage();
    try {
      await prepareAccount(participantPage, testInfo, 'Notification participant');
      const game = await createGame(page, {
        title: `Notification game ${Date.now()}`,
        visibility: 'public',
      });
      const message = `Notification message ${Date.now()}`;
      await participantPage.goto(game.path);
      await participantPage.getByRole('button', { name: /participar da partida/i }).click();
      await participantPage.getByLabel('Nova mensagem').fill(message);
      await participantPage.getByRole('button', { name: 'Enviar mensagem' }).click();

      await page.goto('/notifications');
      const notification = page
        .locator('article')
        .filter({ hasText: 'Nova mensagem na partida' })
        .first();
      await expect(notification).toBeVisible();
      await expect(notification.getByRole('link', { name: 'Abrir' })).toHaveAttribute(
        'href',
        game.path,
      );
      const markRead = notification.getByRole('button', { name: /marcar como lida/i });
      await markRead.click();
      await expect(notification.getByRole('button', { name: /marcar como lida/i })).toHaveCount(0);
    } finally {
      await participantContext.close().catch(() => undefined);
    }
  });

  test('shows stale-state messaging and disables notification mutations offline', async ({
    page,
  }) => {
    await signIn(page, 'ana');
    await page.goto('/notifications');
    await expect(page.getByRole('heading', { name: /fique por dentro/i })).toBeVisible();
    await page.context().setOffline(true);
    try {
      await expect(page.getByRole('status')).toContainText(/offline/i);
      await expect(page.getByRole('button', { name: /marcar todas como lidas/i })).toBeDisabled();
    } finally {
      await page.context().setOffline(false);
    }
  });
});
