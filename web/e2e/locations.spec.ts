import { test, expect, prepareAccount, setTestGeolocation, uniqueSuffix } from './support';

test.describe('Locations screen', () => {
  test('adds and persists a private preferred area', async ({ page }, testInfo) => {
    await prepareAccount(page, testInfo, 'Locations area');
    const label = `New area ${uniqueSuffix(testInfo).slice(-8)}`;
    await page.goto('/locations');
    await page.getByRole('button', { name: /adicionar área$/i }).click();
    await page.getByLabel(/^nome$/i).fill(label);
    await page.getByRole('button', { name: /salvar área/i }).click();

    await expect(page.getByText(label, { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  });

  test('creates a new court from browser geolocation and saves it', async ({ page }, testInfo) => {
    await prepareAccount(page, testInfo, 'Locations court');
    await setTestGeolocation(page.context());
    const name = `New court ${uniqueSuffix(testInfo).slice(-8)}`;
    await page.goto('/locations');
    await page.getByRole('button', { name: /adicionar quadra$/i }).click();
    await page.getByRole('button', { name: /usar minha localização atual/i }).click();
    await page.getByLabel(/nome personalizado/i).fill(name);
    await page.getByRole('button', { name: /^adicionar quadra$/i }).click();

    await expect(page.getByRole('status')).toContainText(/quadra salva/i);
    await page.reload();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  });

  test('saves an existing court from the available court list', async ({ page }, testInfo) => {
    await prepareAccount(page, testInfo, 'Locations existing');
    await page.goto('/locations');
    await page.getByRole('button', { name: /adicionar quadra$/i }).click();
    await page.getByText(/escolher entre quadras já cadastradas/i).click();
    await page.getByRole('button', { name: /e2e praia paulista/i }).click();
    await page.getByRole('button', { name: /salvar quadra/i }).click();

    await expect(page.getByText('E2E Praia Paulista', { exact: true })).toBeVisible();
  });
});
