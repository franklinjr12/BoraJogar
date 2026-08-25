import {
  expect,
  test as base,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test';
import type { AvailabilityRule, PreferredArea, Venue } from '../src/api/client';

export const test = base;
export { expect };

export const sessions = {
  ana: 'seed-session-ana',
  bruno: 'seed-session-bruno',
  carla: 'seed-session-carla',
} as const;

export type SeedUser = keyof typeof sessions;

export type TestAccount = {
  displayName: string;
  email: string;
  password: string;
};

export type PreparedAccount = {
  account: TestAccount;
  area: PreferredArea;
  venue: Venue;
  availability: AvailabilityRule;
};

export type CreatedGame = {
  title: string;
  path: string;
  url: string;
};

type ApiResponseShape = {
  status: () => number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
};

function apiResponseError(response: ApiResponseShape, expectedStatus: number, body: string) {
  return `Expected API status ${expectedStatus}, received ${response.status()}: ${body}`;
}

async function readApi<T>(response: ApiResponseShape, expectedStatus = 200): Promise<T> {
  const body = await response.text();
  if (response.status() !== expectedStatus) {
    throw new Error(apiResponseError(response, expectedStatus, body));
  }
  if (expectedStatus === 204) return undefined as T;
  return (await response.json()) as T;
}

export function uniqueSuffix(testInfo: TestInfo) {
  return `${testInfo.project.name}-${testInfo.testId}-${Date.now()}`
    .replace(/[^a-z0-9-]/gi, '-')
    .toLowerCase();
}

export function uniqueEmail(testInfo: TestInfo, prefix: string) {
  return `${prefix}-${uniqueSuffix(testInfo)}@example.com`;
}

export function futureDate(daysFromNow: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

function gameSchedule() {
  const key = `${test.info().testId}:${test.info().project.name}`;
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return {
    daysFromNow: 7 + (hash % 20),
    hour: String(7 + (Math.floor(hash / 20) % 12)).padStart(2, '0'),
    minute: Math.floor(hash / 2160) % 2 === 0 ? '00' : '30',
  };
}

export function projectFutureDate(daysFromNow: number) {
  return futureDate(daysFromNow);
}

export async function signIn(page: Page, user: SeedUser) {
  const baseURL = test.info().project.use.baseURL;
  if (typeof baseURL !== 'string') throw new Error('Playwright baseURL is required.');
  await page.context().addCookies([
    {
      name: 'borajogar_session',
      value: sessions[user],
      url: baseURL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

export async function signUpWithEmail(
  page: Page,
  displayName: string,
  email: string,
  returnTo: string,
  password = 'pw',
) {
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel(/nome exibido/i).fill(displayName);
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/senha/i).fill(password);
  await page.getByRole('button', { name: /^criar conta$/i }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'));
}

export async function saveProfileStep(page: Page, displayName: string) {
  await expect(
    page.getByRole('heading', {
      name: /conte sobre seu jogo|informe seu nome e n.vel para entrar/i,
    }),
  ).toBeVisible();
  await page.getByLabel(/nome exibido/i).fill(displayName);
  await page.getByRole('button', { name: /^continuar$/i }).click();
}

export async function saveAreaStep(page: Page, label: string) {
  await expect(page.getByText('Locais para jogar', { exact: true })).toBeVisible();
  const chooseArea = page.getByRole('button', { name: /escolher uma área/i });
  if (await chooseArea.count()) await chooseArea.click();
  await page.getByLabel(/^nome$/i).fill(label);
  await page.getByRole('button', { name: /salvar área/i }).click();
  await expect(page.getByText(/área salva/i)).toBeVisible();
  await page.getByRole('button', { name: /^continuar$/i }).click();
}

export async function saveAvailabilityStep(page: Page) {
  await expect(page.getByText(/sua agenda/i)).toBeVisible();
  await page.getByRole('button', { name: /adicionar horário disponível/i }).click();
  await expect(page.getByText(/horário disponível salvo/i)).toBeVisible();
}

export async function completeOnboarding(page: Page, displayName: string, areaLabel: string) {
  await saveProfileStep(page, displayName);
  await saveAreaStep(page, areaLabel);
  await saveAvailabilityStep(page);
}

export async function chooseDate(page: Page, value: string) {
  const [year, month, day] = value.split('-').map(Number);
  const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(
    new Date(year, month - 1, day),
  );
  await page.getByLabel(/data/i).click();
  const dialog = page.getByRole('dialog').last();
  const dateButton = dialog.getByRole('button', {
    name: new RegExp(`${day} de ${monthLabel} de ${year}`, 'i'),
  });
  for (
    let monthAttempt = 0;
    monthAttempt < 12 && (await dateButton.count()) === 0;
    monthAttempt += 1
  ) {
    await dialog.getByRole('button', { name: /próximo mês/i }).click();
  }
  await expect(dateButton.first()).toBeVisible();
  await dateButton.first().click();
  await dialog.getByRole('button', { name: /concluído/i }).click({ force: true });
  await expect(dialog).toHaveCount(0);
}

export async function chooseTime(page: Page, hour: string, minute: string) {
  const nativeTimeInput = page.locator('.desktop-time-input');
  if (await nativeTimeInput.isVisible()) {
    await nativeTimeInput.fill(`${hour}:${minute}`);
    await expect(nativeTimeInput).toHaveValue(`${hour}:${minute}`);
    return;
  }

  const trigger = page.getByRole('button', { name: /abrir seletor de horário/i });
  await expect(trigger).toBeVisible();
  await trigger.click();
  await page.getByRole('textbox', { name: 'Hora', exact: true }).fill(hour);
  await page.getByRole('textbox', { name: 'Minutos', exact: true }).fill(minute);
  await page.getByRole('button', { name: /definir/i }).click();
}

export async function createGame(
  page: Page,
  options: {
    title: string;
    daysFromNow?: number;
    hour?: string;
    minute?: string;
    capacity?: string;
    waitlist?: boolean;
    waitlistSize?: string;
    visibility?: 'public' | 'link-only' | 'private';
    venueLabel?: string;
  },
): Promise<CreatedGame> {
  const schedule = gameSchedule();
  await page.goto('/games/new');
  await chooseDate(page, futureDate(options.daysFromNow ?? schedule.daysFromNow));
  await chooseTime(page, options.hour ?? schedule.hour, options.minute ?? schedule.minute);
  const venueSelect = page.getByRole('combobox', { name: /^quadra$/i });
  const venueLabel = options.venueLabel ?? 'E2E Praia Paulista';
  await expect(venueSelect.locator('option').filter({ hasText: venueLabel })).toHaveCount(1);
  await venueSelect.selectOption({ label: venueLabel });
  await page.getByLabel(/número de jogadores/i).fill(options.capacity ?? '4');
  if (options.waitlist) {
    await page.getByRole('checkbox', { name: /ativar lista de espera/i }).check();
    await page.getByLabel(/tamanho da lista de espera/i).fill(options.waitlistSize ?? '1');
  }
  await page
    .getByRole('combobox', { name: /visibilidade/i })
    .selectOption(options.visibility ?? 'public');
  await page.getByLabel(/título/i).fill(options.title);
  await page.getByRole('button', { name: /criar partida/i }).click();
  await expect(page).toHaveURL(/\/games\/[0-9a-f-]+\?access=[A-Za-z0-9_-]+$/);
  return {
    title: options.title,
    path: new URL(page.url()).pathname,
    url: page.url(),
  };
}

export async function createApiAccount(page: Page, testInfo: TestInfo, prefix: string) {
  const account: TestAccount = {
    displayName: `${prefix} ${uniqueSuffix(testInfo).slice(-12)}`,
    email: uniqueEmail(testInfo, prefix.toLowerCase().replace(/\s+/g, '-')),
    password: 'pw',
  };
  await readApi<{ redirectTo: string }>(
    await page.request.post('/api/v1/auth/email/signup', { data: account }),
  );
  return account;
}

export async function prepareAccount(
  page: Page,
  testInfo: TestInfo,
  prefix: string,
): Promise<PreparedAccount> {
  const account = await createApiAccount(page, testInfo, prefix);
  const suffix = uniqueSuffix(testInfo);
  await readApi(
    await page.request.put('/api/v1/me/profile', {
      data: {
        displayName: account.displayName,
        timeZone: 'America/Sao_Paulo',
        skillLevel: 'intermediate',
        bio: 'Conta Playwright.',
        styles: ['mixed'],
        preferredGameDurationMinutes: 90,
        minimumNoticeMinutes: 0,
        activeForMatchmaking: true,
      },
    }),
  );
  const area = await readApi<PreferredArea>(
    await page.request.post('/api/v1/me/preferred-areas', {
      data: {
        label: `${prefix} area ${suffix.slice(-8)}`,
        latitude: -25.428,
        longitude: -49.273,
        radiusMeters: 4000,
        priority: 0,
      },
    }),
    201,
  );
  const venue = await readApi<Venue>(
    await page.request.post('/api/v1/me/venues', {
      data: {
        name: `${prefix} court ${suffix.slice(-8)}`,
        city: 'Curitiba',
        addressLabel: 'Rua Playwright, 100',
        latitude: -25.428,
        longitude: -49.273,
        lightingStatus: 'has_lighting',
        surfaceType: 'sand',
        accessType: 'public',
      },
    }),
    201,
  );
  await readApi(await page.request.post(`/api/v1/me/favorite-venues/${venue.id}`), 204);
  const availability = await readApi<AvailabilityRule>(
    await page.request.post('/api/v1/me/availability/rules', {
      data: {
        weekday: 6,
        start: '09:00',
        end: '13:00',
        timezone: 'America/Sao_Paulo',
        validFrom: futureDate(0),
        active: true,
        venueIds: [venue.id],
        preferredAreaIds: [area.id],
      },
    }),
    200,
  );
  await readApi(await page.request.post('/api/v1/me/onboarding/complete'), 204);
  return { account, area, venue, availability };
}

export async function openSeedUser(browser: Browser, user: SeedUser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, user);
  return { context, page };
}

export async function setTestGeolocation(context: BrowserContext) {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -25.428, longitude: -49.273 });
}

export async function apiGet<T>(request: APIRequestContext, path: string) {
  return readApi<T>(await request.get(path));
}
