import { expect, test, type Page } from '@playwright/test';

const sessions = {
  ana: 'seed-session-ana',
  carla: 'seed-session-carla',
};

async function signIn(page: Page, token: string) {
  const baseURL = test.info().project.use.baseURL;
  if (typeof baseURL !== 'string') throw new Error('Playwright baseURL is required.');
  await page.context().addCookies([
    {
      name: 'borajogar_session',
      value: token,
      url: baseURL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

function futureDate(daysFromNow: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

test.describe('Bora Jogar real backend E2E', () => {
  test('requires backend authentication for protected profile data', async ({ page }) => {
    await page.goto('/profile');

    await expect(page.getByText(/sign in to view your profile/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });

  test('loads and updates profile through the real API', async ({ page }) => {
    await signIn(page, sessions.ana);
    await page.goto('/profile');

    await expect(page.getByRole('heading', { name: /Ana/i })).toBeVisible();
    await page.getByRole('button', { name: /edit profile/i }).click();
    await page.getByLabel(/display name/i).fill('Ana E2E Updated');
    await page.getByRole('button', { name: /save changes/i }).click();

    await expect(page.getByRole('heading', { name: 'Ana E2E Updated' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Ana E2E Updated' })).toBeVisible();
  });

  test('lists seeded games and creates a game through the backend', async ({ page }) => {
    await signIn(page, sessions.ana);
    await page.goto('/games');

    await expect(page.getByRole('heading', { name: /get on court/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'E2E Open Game' })).toBeVisible();

    await page.getByRole('link', { name: /create a game/i }).click();
    await page.getByLabel(/date/i).fill(futureDate(5));
    await page.getByLabel(/start time/i).fill('10:30');
    await page.getByLabel(/venue/i).selectOption({ label: 'E2E Praia Paulista' });
    await page.getByLabel(/title/i).fill('E2E Created From Browser');
    await page.getByRole('button', { name: /create game/i }).click();

    await expect(page).toHaveURL(/\/games\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: 'E2E Created From Browser' })).toBeVisible();
    await expect(page.getByText('E2E Praia Paulista')).toBeVisible();
  });

  test('waitlists a player when a real backend game is full', async ({ page }) => {
    await signIn(page, sessions.carla);
    await page.goto('/games/60000000-0000-0000-0000-000000000102');

    await expect(page.getByRole('heading', { name: 'E2E Full Game' })).toBeVisible();
    await expect(page.getByText(/0 open slots/i)).toBeVisible();
    await page.getByRole('button', { name: /join game/i }).click();

    await expect(page.getByRole('heading', { name: /waitlist/i })).toBeVisible();
    await expect(page.getByText('Carla Lima')).toBeVisible();
  });
});
