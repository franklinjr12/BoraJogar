import { test, expect, createGame, openSeedUser, signIn, uniqueSuffix } from './support';

test.describe('Game details screen', () => {
  test('adds multiple players, keeps chat history, and limits chat to members', async ({
    browser,
    page,
  }, testInfo) => {
    await signIn(page, 'ana');
    const game = await createGame(page, {
      title: `Chat game ${uniqueSuffix(testInfo).slice(-8)}`,
      capacity: '4',
      visibility: 'public',
    });
    const bruno = await openSeedUser(browser, 'bruno');
    const carla = await openSeedUser(browser, 'carla');
    const guest = await browser.newPage();
    const brunoMessage = `Bruno message ${uniqueSuffix(testInfo).slice(-6)}`;
    const carlaMessage = `Carla message ${uniqueSuffix(testInfo).slice(-6)}`;
    try {
      await bruno.page.goto(game.path);
      await bruno.page.getByRole('button', { name: /participar da partida/i }).click();
      await expect(bruno.page.getByRole('button', { name: /sair da partida/i })).toBeVisible();
      await bruno.page.getByLabel('Nova mensagem').fill(brunoMessage);
      await bruno.page.getByRole('button', { name: 'Enviar mensagem' }).click();

      await carla.page.goto(game.path);
      await carla.page.getByRole('button', { name: /participar da partida/i }).click();
      await expect(carla.page.getByText(brunoMessage)).toBeVisible();
      await carla.page.getByLabel('Nova mensagem').fill(carlaMessage);
      await carla.page.getByRole('button', { name: 'Enviar mensagem' }).click();

      await page.reload();
      await expect(page.getByText(brunoMessage)).toBeVisible();
      await expect(page.getByText(carlaMessage)).toBeVisible();
      await expect(page.getByRole('link', { name: /bruno costa/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /carla lima/i })).toBeVisible();

      await guest.goto(game.path);
      await expect(guest.getByRole('heading', { name: /chat da partida/i })).toHaveCount(0);
    } finally {
      await bruno.context.close().catch(() => undefined);
      await carla.context.close().catch(() => undefined);
      await guest.close().catch(() => undefined);
    }
  });

  test('supports waitlist promotion after a confirmed player leaves', async ({
    browser,
    page,
  }, testInfo) => {
    await signIn(page, 'ana');
    const game = await createGame(page, {
      title: `Waitlist game ${uniqueSuffix(testInfo).slice(-8)}`,
      capacity: '2',
      waitlist: true,
      waitlistSize: '1',
      visibility: 'public',
    });
    const bruno = await openSeedUser(browser, 'bruno');
    const carla = await openSeedUser(browser, 'carla');
    try {
      await bruno.page.goto(game.path);
      await bruno.page.getByRole('button', { name: /participar da partida/i }).click();
      await expect(bruno.page.getByRole('button', { name: /sair da partida/i })).toBeVisible();
      await carla.page.goto(game.path);
      await carla.page.getByRole('button', { name: /entrar na lista de espera/i }).click();
      await expect(carla.page.getByText('Lista de espera: 1/1')).toBeVisible();

      await bruno.page.getByRole('button', { name: /sair da partida/i }).click();
      await expect(bruno.page.getByText(/1 vaga disponível/i)).toBeVisible();
      await carla.page.reload();
      await carla.page.getByRole('button', { name: /tentar pegar a vaga/i }).click();

      await expect(carla.page.getByRole('button', { name: /sair da partida/i })).toBeVisible();
      await expect(
        carla.page.getByRole('button', { name: /sair da lista de espera/i }),
      ).toHaveCount(0);
    } finally {
      await bruno.context.close().catch(() => undefined);
      await carla.context.close().catch(() => undefined);
    }
  });

  test('removes a player and cancels a game with confirmation', async ({
    browser,
    page,
  }, testInfo) => {
    await signIn(page, 'ana');
    const game = await createGame(page, {
      title: `Manage game ${uniqueSuffix(testInfo).slice(-8)}`,
      visibility: 'public',
    });
    const bruno = await openSeedUser(browser, 'bruno');
    try {
      await bruno.page.goto(game.path);
      await bruno.page.getByRole('button', { name: /participar da partida/i }).click();
      await expect(bruno.page.getByRole('button', { name: /sair da partida/i })).toBeVisible();
      await page.reload();
      await page.getByRole('button', { name: /remover bruno costa/i }).click();
      await expect(page.getByRole('heading', { name: /remover jogador/i })).toBeVisible();
      await page
        .getByRole('button', { name: /remover jogador/i })
        .last()
        .click();
      await expect(page.getByText('Bruno Costa')).toHaveCount(0);

      await page.getByRole('button', { name: /cancelar partida/i }).click();
      await expect(page.getByRole('heading', { name: /cancelar partida/i })).toBeVisible();
      await page
        .getByRole('button', { name: /cancelar partida/i })
        .last()
        .click();
      await expect(page.getByRole('alert', { name: /partida cancelada/i })).toBeVisible();
    } finally {
      await bruno.context.close().catch(() => undefined);
    }
  });

  test('creates an account from an anonymous game link and joins with automatic profile defaults', async ({
    browser,
    page,
  }, testInfo) => {
    await signIn(page, 'ana');
    const game = await createGame(page, {
      title: `Join account game ${uniqueSuffix(testInfo).slice(-8)}`,
      visibility: 'public',
    });
    const guest = await browser.newPage();
    const displayName = `Joiner ${uniqueSuffix(testInfo).slice(-8)}`;
    try {
      await guest.goto(game.path);
      await expect(guest.getByRole('heading', { name: game.title })).toBeVisible();
      await guest.getByRole('link', { name: /entre para participar/i }).click();
      await expect(guest).toHaveURL(/\/login\?returnTo=/);
      await guest.getByLabel(/nome exibido/i).fill(displayName);
      await guest.getByLabel(/e-mail/i).fill(`${uniqueSuffix(testInfo)}@example.com`);
      await guest.getByLabel(/senha/i).fill('pw');
      await guest.getByRole('button', { name: /^criar conta$/i }).click();

      await expect(guest).toHaveURL(new RegExp(`${game.path}$`));
      await guest.getByRole('button', { name: /participar da partida/i }).click();
      await expect(guest.getByRole('button', { name: /sair da partida/i })).toBeVisible();
    } finally {
      await guest.close();
    }
  });
});
