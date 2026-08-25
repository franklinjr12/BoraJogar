import { test, expect, prepareAccount, futureDate } from './support';

test.describe('Availability screen', () => {
  test('adds a targeted availability rule and persists it', async ({ page }, testInfo) => {
    const prepared = await prepareAccount(page, testInfo, 'Availability');
    await page.goto('/availability');
    await page.getByRole('button', { name: /noites durante a semana/i }).click();
    await page.getByLabel(/selecionar locais/i).check();
    await page.getByLabel(new RegExp(prepared.venue.name, 'i')).check();
    await page.getByRole('button', { name: /adicionar horário disponível/i }).click();

    await expect(page.getByText('18:00-20:00', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('18:00-20:00', { exact: true })).toBeVisible();
    const rule = page.locator('.availability-row').filter({ hasText: '18:00-20:00' });
    await rule.getByRole('button', { name: 'Remover' }).click();
    await expect(page.getByText('18:00-20:00', { exact: true })).toHaveCount(0);
  });

  test('creates and removes a date-specific availability exception', async ({ page }, testInfo) => {
    await prepareAccount(page, testInfo, 'Availability exception');
    await page.goto('/availability');
    const date = futureDate(10);
    await page.locator('input[type="date"]').fill(date);
    await page.getByRole('button', { name: /salvar exceção/i }).click();

    await expect(page.getByText(date, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Remover' }).last().click();
    await expect(page.getByText(date, { exact: true })).toHaveCount(0);
  });

  test('rejects an availability interval whose end precedes its start', async ({
    page,
  }, testInfo) => {
    await prepareAccount(page, testInfo, 'Availability invalid');
    await page.goto('/availability');
    await page.getByRole('button', { name: /escolher horários específicos/i }).click();
    const start = page.locator('input.desktop-time-input').nth(0);
    const end = page.locator('input.desktop-time-input').nth(1);
    if (await start.isVisible()) {
      await start.fill('20:00');
      await end.fill('18:00');
    } else {
      await page
        .getByRole('button', { name: /abrir seletor de horário/i })
        .nth(0)
        .click();
      await page.getByRole('textbox', { name: 'Hora', exact: true }).fill('20');
      await page.getByRole('textbox', { name: 'Minutos', exact: true }).fill('00');
      await page.getByRole('button', { name: /definir/i }).click();
      await page
        .getByRole('button', { name: /abrir seletor de horário/i })
        .nth(1)
        .click();
      await page.getByRole('textbox', { name: 'Hora', exact: true }).fill('18');
      await page.getByRole('textbox', { name: 'Minutos', exact: true }).fill('00');
      await page.getByRole('button', { name: /definir/i }).click();
    }
    await page.getByRole('button', { name: /adicionar horário disponível/i }).click();

    await expect(page.getByRole('alert')).toContainText(/fim precisa ser depois/i);
  });
});
