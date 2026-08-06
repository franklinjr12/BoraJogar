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
  await page.getByLabel(/nome exibido/i).fill(displayName);
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/senha/i).fill('pw');
  await page
    .locator('form')
    .getByRole('button', { name: /^criar conta$/i })
    .click();
}

async function saveProfileStep(page: Page, displayName: string) {
  await expect(page.getByRole('heading', { name: /conte sobre seu jogo/i })).toBeVisible();
  await page.getByLabel(/nome exibido/i).fill(displayName);
  await page.getByRole('button', { name: /^continuar$/i }).click();
}

async function saveAreaStep(page: Page, label: string) {
  await expect(page.getByText('Locais para jogar', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /escolher uma área/i }).click();
  await page.getByLabel(/^nome$/i).fill(label);
  await page.getByRole('button', { name: /salvar área/i }).click();
  await expect(page.getByText(/área salva/i)).toBeVisible();
  await page.getByRole('button', { name: /^continuar$/i }).click();
}

async function saveAvailabilityStep(page: Page) {
  await expect(page.getByText(/sua agenda/i)).toBeVisible();
  await page.getByRole('button', { name: /adicionar horário disponível/i }).click();
  await expect(page.getByText(/horário disponível salvo/i)).toBeVisible();
  const emailOnly = page.getByRole('button', { name: /usar apenas e-mail/i });
  if (await emailOnly.isVisible().catch(() => false)) await emailOnly.click();
}

function futureDate(daysFromNow: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

test.describe('Bora Jogar real backend E2E', () => {
  test('requires backend authentication for protected profile data', async ({ page }) => {
    await page.goto('/profile');

    await expect(page.getByText(/entre para ver seu perfil/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /entrar/i })).toHaveAttribute('href', '/login');
  });

  test('loads and updates profile through the real API', async ({ page }) => {
    await signIn(page, sessions.ana);
    await page.goto('/profile');

    await expect(page.getByRole('heading', { name: /Ana/i })).toBeVisible();
    await page.getByRole('button', { name: /editar perfil/i }).click();
    await page.getByLabel(/nome exibido/i).fill('Ana E2E Updated');
    await page.getByRole('button', { name: /salvar alterações/i }).click();

    await expect(page.getByRole('heading', { name: 'Ana E2E Updated' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Ana E2E Updated' })).toBeVisible();
  });

  test('lists seeded games and creates a game through the backend', async ({ page }) => {
    await signIn(page, sessions.ana);
    await page.goto('/games');

    await expect(page.getByRole('heading', { name: /vamos jogar/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'E2E Open Game' })).toBeVisible();

    await page.getByRole('link', { name: /criar uma partida/i }).click();
    await page.getByLabel(/data/i).fill(futureDate(5));
    await page.getByLabel(/horário de início/i).fill('10:30');
    await page.getByRole('combobox', { name: /^quadra$/i }).selectOption({
      label: 'E2E Praia Paulista',
    });
    await page.getByLabel(/título/i).fill('E2E Created From Browser');
    await page.getByRole('button', { name: /criar partida/i }).click();

    await expect(page).toHaveURL(/\/games\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: 'E2E Created From Browser' })).toBeVisible();
    await expect(page.getByText('E2E Praia Paulista')).toBeVisible();
  });

  test('new create-game user completes onboarding before game creation', async ({ page }) => {
    const displayName = 'New Flow Player';
    await page.goto('/');
    await page.getByRole('link', { name: /começar/i }).click();
    await page.getByRole('link', { name: /criar uma partida/i }).click();
    await signUpWithEmail(
      page,
      displayName,
      uniqueEmail('new-flow'),
      '/onboarding?goal=create_game',
    );

    await saveProfileStep(page, displayName);
    await saveAreaStep(page, 'New flow area');
    await saveAvailabilityStep(page);
    await page.getByRole('button', { name: /^criar partida$/i }).click();

    await expect(page).toHaveURL(/\/games\/new$/);
    await expect(page.getByRole('heading', { name: /configure uma partida/i })).toBeVisible();
    await expect(page.getByRole('combobox', { name: /^quadra$/i })).toHaveValue(/area:/);
    await expect(page.getByText(/esta partida usará new flow area/i)).toBeVisible();
  });

  test('returning incomplete user resumes setup and profile never asks to sign in', async ({
    page,
  }) => {
    const displayName = 'Returning Flow Player';
    await signUpWithEmail(page, displayName, uniqueEmail('returning-flow'), '/onboarding');
    await saveProfileStep(page, displayName);

    await page
      .getByRole('main')
      .getByRole('link', { name: /^início$/i })
      .click();
    await expect(page.getByRole('heading', { name: /que bom ver você, returning/i })).toBeVisible();
    await page.evaluate(() =>
      localStorage.setItem(
        'borajogar_onboarding',
        JSON.stringify({ step: 8, profile: { displayName: 'stale legacy state' } }),
      ),
    );

    await page.getByRole('link', { name: /perfil/i }).click();
    await expect(page.getByRole('heading', { name: displayName })).toBeVisible();
    await expect(page.getByText(/entre para ver seu perfil/i)).toHaveCount(0);

    await page.goto('/onboarding');
    await saveAreaStep(page, 'Returning flow area');
    await saveAvailabilityStep(page);
    await page.getByRole('button', { name: /ir para o painel/i }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: /que bom ver você, returning/i })).toBeVisible();
  });

  test('waitlists a player when a real backend game is full', async ({ page }) => {
    await signIn(page, sessions.carla);
    await page.goto('/games/60000000-0000-0000-0000-000000000102');

    await expect(page.getByRole('heading', { name: 'E2E Full Game' })).toBeVisible();
    await expect(page.getByText(/0 vagas disponíveis/i)).toBeVisible();
    await page.getByRole('button', { name: /participar da partida/i }).click();

    await expect(page.getByRole('heading', { name: /lista de espera/i })).toBeVisible();
    await expect(page.getByText('Carla Lima')).toBeVisible();
  });
});
