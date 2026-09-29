import { expect, test, type Page } from '@playwright/test';

const avatarSelector = '.identity-photo .passport-photo img';

async function openIdentity(page: Page): Promise<void> {
  const response = await page.goto('/');
  expect(response?.status(), 'The application must render without a server error').toBe(200);
  await page.getByRole('button', { name: 'Open passport', exact: true }).click();
  await expect(page.getByTestId('passport-workspace')).toHaveAttribute('data-book-state', 'open');
  await expect(page.locator(avatarSelector)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

async function expectLoadedAvatar(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.locator(avatarSelector).evaluate((element) => {
          const avatar = element as HTMLImageElement;
          return avatar.complete && avatar.naturalWidth > 0 && avatar.naturalHeight > 0;
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
}

test('the real avatar endpoint renders, changes on request, and retains its seed after reload', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  const avatarResponses: Array<{ url: string; status: number }> = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (new URL(response.url()).hostname === 'api.dicebear.com') {
      avatarResponses.push({ url: response.url(), status: response.status() });
    }
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await openIdentity(page);
  const avatar = page.locator(avatarSelector);
  await expectLoadedAvatar(page);
  await expect(avatar).toHaveAttribute(
    'src',
    /^https:\/\/api\.dicebear\.com\/10\.x\/adventurer\/svg\?seed=.+/,
  );
  const originalSource = await avatar.getAttribute('src');
  expect(
    avatarResponses.some(
      (response) =>
        response.url === originalSource && response.status >= 200 && response.status < 400,
    ),
  ).toBe(true);
  expect(avatarResponses.filter((response) => response.status >= 500)).toEqual([]);

  await page.getByLabel('Your name', { exact: true }).fill('Ava');
  await expect(avatar).toHaveAttribute('src', originalSource!);
  await page.getByRole('button', { name: 'Change avatar', exact: true }).click();
  await expect.poll(() => avatar.getAttribute('src')).not.toBe(originalSource);
  await expectLoadedAvatar(page);
  const chosenSource = await avatar.getAttribute('src');
  expect(chosenSource).toMatch(/^https:\/\/api\.dicebear\.com\/10\.x\/adventurer\/svg\?seed=.+/);
  await page.screenshot({ path: testInfo.outputPath('avatar-remote-1440.png'), fullPage: true });

  const reloaded = await page.reload();
  expect(reloaded?.status()).toBe(200);
  await expect(page.getByTestId('passport-workspace')).toHaveAttribute('data-book-state', 'open');
  await expect(avatar).toHaveAttribute('src', chosenSource!);
  await expectLoadedAvatar(page);
  expect(errors).toEqual([]);
  expect(avatarResponses.filter((response) => response.status >= 500)).toEqual([]);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 320, height: 700 },
  { width: 390, height: 844 },
]) {
  test(`a failed avatar uses the local fallback without shifting the layout at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let releaseFailure = () => {};
    let attemptedRequests = 0;
    const pendingFailure = new Promise<void>((resolve) => {
      releaseFailure = resolve;
    });
    await page.route('https://api.dicebear.com/**', async (route) => {
      attemptedRequests += 1;
      await pendingFailure;
      await route.abort('failed');
    });
    try {
      await page.setViewportSize(viewport);
      await openIdentity(page);
      const avatar = page.locator(avatarSelector);
      const photo = page.locator('.identity-photo .passport-photo');
      await expect.poll(() => attemptedRequests).toBeGreaterThan(0);
      const frameBefore = await photo.boundingBox();
      const imageBefore = await avatar.boundingBox();
      const nameBefore = await page.getByLabel('Your name', { exact: true }).boundingBox();
      expect(frameBefore).not.toBeNull();
      expect(imageBefore).not.toBeNull();
      await page.screenshot({
        path: testInfo.outputPath(`avatar-pending-${viewport.width}.png`),
        fullPage: true,
      });

      const layoutShift = await page.evaluateHandle(() => {
        const measured = { value: 0 };
        const observer = new PerformanceObserver((entries) => {
          for (const entry of entries.getEntries())
            measured.value += (entry as PerformanceEntry & { value: number }).value;
        });
        observer.observe({ type: 'layout-shift', buffered: false });
        return { measured, observer };
      });
      releaseFailure();
      await expect(avatar).toHaveAttribute('src', '/avatar-fallback.svg');
      await expectLoadedAvatar(page);
      expect(await photo.boundingBox()).toEqual(frameBefore);
      expect(await avatar.boundingBox()).toEqual(imageBefore);
      expect(await page.getByLabel('Your name', { exact: true }).boundingBox()).toEqual(nameBefore);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const shiftValue = await layoutShift.evaluate(({ measured, observer }) => {
        observer.disconnect();
        return measured.value;
      });
      await layoutShift.dispose();
      expect(shiftValue, 'The image failure must not cause a layout shift').toBe(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`avatar-fallback-${viewport.width}.png`),
        fullPage: true,
      });
      expect(errors).toEqual([]);
    } finally {
      releaseFailure();
    }
  });
}
