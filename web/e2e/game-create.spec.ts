import {
  test,
  expect,
  chooseDate,
  chooseTime,
  createGame,
  projectFutureDate,
  signIn,
  uniqueSuffix,
} from './support';

test.describe('Game creation screen', () => {
  test('creates a public game with capacity and waitlist settings', async ({ page }, testInfo) => {
    await signIn(page, 'ana');
    const title = `Created game ${uniqueSuffix(testInfo).slice(-8)}`;
    await createGame(page, {
      title,
      capacity: '2',
      waitlist: true,
      waitlistSize: '2',
      confirmation: true,
      visibility: 'public',
    });

    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText('E2E Praia Paulista')).toBeVisible();
    await expect(page.getByText('Lista de espera: 0/2')).toBeVisible();
    await expect(page.getByText(/2 jogadores/)).toBeVisible();
    await expect(page.getByText('Confirmações: 0/1')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /confirmar presen.a/i })).toBeDisabled();
  });

  test('uses a saved preferred area as a new game location', async ({ page }, testInfo) => {
    await signIn(page, 'ana');
    const title = `Area game ${uniqueSuffix(testInfo).slice(-8)}`;
    await page.goto('/games/new');
    const venueSelect = page.getByRole('combobox', { name: /^quadra$/i });
    const areaOption = venueSelect.locator('option[value^="area:"]').first();
    await expect(areaOption).toBeAttached();
    const areaValue = await areaOption.getAttribute('value');
    if (!areaValue) throw new Error('Expected a saved preferred-area option.');
    const areaLabel = (await areaOption.textContent())?.trim() ?? '';
    await venueSelect.selectOption(areaValue);
    await chooseDate(page, projectFutureDate(6));
    await chooseTime(page, testInfo.project.name === 'mobile-chromium' ? '12' : '11', '00');
    await page.getByLabel(/título/i).fill(title);
    await page.getByRole('button', { name: /criar partida/i }).click();

    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText(areaLabel, { exact: true })).toBeVisible();
  });
});
