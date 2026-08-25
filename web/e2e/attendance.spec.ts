import { test, expect, signIn } from './support';

test.describe('Attendance screen', () => {
  test('lets an organizer record a player attendance status', async ({ page }) => {
    await signIn(page, 'carla');
    await page.goto('/games/60000000-0000-0000-0000-000000000003/attendance');

    await expect(page.getByRole('heading', { name: 'Jogo encerrado' })).toBeVisible();
    const anaRow = page.getByRole('group', { name: /presença de ana admin/i });
    await anaRow.getByRole('button', { name: 'Foi', exact: true }).click();

    await expect(anaRow.getByRole('button', { name: 'Foi', exact: true })).toHaveClass(/selected/);
  });
});
