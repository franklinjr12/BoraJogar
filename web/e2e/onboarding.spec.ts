import {
  test,
  expect,
  setTestGeolocation,
  signUpWithEmail,
  uniqueEmail,
  uniqueSuffix,
  saveProfileStep,
  saveAreaStep,
  saveAvailabilityStep,
} from './support';

test.describe('Onboarding screen', () => {
  test('completes new-user setup and continues to requested game creation', async ({
    page,
  }, testInfo) => {
    const displayName = `New player ${uniqueSuffix(testInfo).slice(-8)}`;
    await setTestGeolocation(page.context());
    await signUpWithEmail(
      page,
      displayName,
      uniqueEmail(testInfo, 'onboarding'),
      '/onboarding?goal=create_game',
    );

    await saveProfileStep(page, displayName);
    await saveAreaStep(page, `Onboarding area ${uniqueSuffix(testInfo).slice(-6)}`);
    await saveAvailabilityStep(page);
    await page.getByRole('button', { name: /^criar partida$/i }).click();

    await expect(page).toHaveURL(/\/games\/new$/);
    await expect(page.getByRole('heading', { name: /configure uma partida/i })).toBeVisible();
  });

  test('requires a location before advancing past the location step', async ({
    page,
  }, testInfo) => {
    const displayName = `Missing location ${uniqueSuffix(testInfo).slice(-8)}`;
    await signUpWithEmail(
      page,
      displayName,
      uniqueEmail(testInfo, 'missing-location'),
      '/onboarding',
    );
    await saveProfileStep(page, displayName);

    await page.getByRole('button', { name: /^continuar$/i }).click();
    await expect(page.getByRole('alert')).toContainText(/adicione uma quadra ou área/i);
  });
});
