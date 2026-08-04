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

function uniqueEmail(prefix: string) {
  const project = test
    .info()
    .project.name.replace(/[^a-z0-9]+/gi, '-')
    .toLowerCase();
  return `${prefix}-${project}-${Date.now()}@example.com`;
}

async function signUpWithEmail(page: Page, displayName: string, email: string, returnTo: string) {
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel(/display name/i).fill(displayName);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill('pw');
  await page
    .locator('form')
    .getByRole('button', { name: /^create account$/i })
    .click();
}

async function saveProfileStep(page: Page, displayName: string) {
  await expect(page.getByRole('heading', { name: /tell us about your game/i })).toBeVisible();
  await page.getByLabel(/display name/i).fill(displayName);
  await page.getByRole('button', { name: /^continue$/i }).click();
}

async function saveAreaStep(page: Page, label: string) {
  await expect(page.getByText('Playing locations', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /choose an area/i }).click();
  await page.getByLabel(/^label$/i).fill(label);
  await page.getByRole('button', { name: /save area/i }).click();
  await expect(page.getByText(/area saved/i)).toBeVisible();
  await page.getByRole('button', { name: /^continue$/i }).click();
}

async function saveAvailabilityStep(page: Page) {
  await expect(page.getByText(/your schedule/i)).toBeVisible();
  await page.getByRole('button', { name: /add available time/i }).click();
  await expect(page.getByText(/available time saved/i)).toBeVisible();
  await page.getByRole('button', { name: /use email only/i }).click();
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

  test('new create-game user completes onboarding before game creation', async ({ page }) => {
    const displayName = 'New Flow Player';
    await page.goto('/');
    await page.getByRole('link', { name: /get started/i }).click();
    await page.getByRole('link', { name: /create a game/i }).click();
    await signUpWithEmail(
      page,
      displayName,
      uniqueEmail('new-flow'),
      '/onboarding?goal=create_game',
    );

    await saveProfileStep(page, displayName);
    await saveAreaStep(page, 'New flow area');
    await saveAvailabilityStep(page);
    await page.getByRole('button', { name: /^create game$/i }).click();

    await expect(page).toHaveURL(/\/games\/new$/);
    await expect(page.getByRole('heading', { name: /set up a game/i })).toBeVisible();
    await expect(page.getByLabel(/venue/i)).toHaveValue(/area:/);
    await expect(page.getByText(/this game will use new flow area/i)).toBeVisible();
  });

  test('returning incomplete user resumes setup and profile never asks to sign in', async ({
    page,
  }) => {
    const displayName = 'Returning Flow Player';
    await signUpWithEmail(page, displayName, uniqueEmail('returning-flow'), '/onboarding');
    await saveProfileStep(page, displayName);

    await page
      .getByRole('main')
      .getByRole('link', { name: /^home$/i })
      .click();
    await expect(page.getByRole('link', { name: /continue setup/i })).toBeVisible();
    await page.evaluate(() =>
      localStorage.setItem(
        'borajogar_onboarding',
        JSON.stringify({ step: 8, profile: { displayName: 'stale legacy state' } }),
      ),
    );

    await page.getByRole('link', { name: /profile/i }).click();
    await expect(page.getByRole('heading', { name: displayName })).toBeVisible();
    await expect(page.getByText(/sign in to view your profile/i)).toHaveCount(0);

    await page.goto('/');
    await page.getByRole('link', { name: /continue setup/i }).click();
    await saveAreaStep(page, 'Returning flow area');
    await saveAvailabilityStep(page);
    await page.getByRole('button', { name: /go to dashboard/i }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: /good to see you, returning/i })).toBeVisible();
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
