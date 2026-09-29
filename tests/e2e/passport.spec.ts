import { expect, test } from '@playwright/test';
import { closePlayers, inspectLayout, openPlayer } from './helpers';

test('the passport cover opens and closes reliably, including repeated activation', async ({
  browser,
}, testInfo) => {
  const player = await openPlayer(browser, 'Ava', false);
  try {
    await expect(
      player.page.getByRole('button', { name: 'Open passport', exact: true }),
    ).toBeVisible();
    await inspectLayout(player.page, testInfo, 'closed-cover');
    await player.page.setViewportSize({ width: 1280, height: 800 });
    // Repeated user activation must not create duplicate spreads or leave the cover halfway open.
    await player.page
      .getByRole('button', { name: 'Open passport', exact: true })
      .evaluate((button) => {
        for (let index = 0; index < 5; index++) (button as HTMLButtonElement).click();
      });
    await expect(player.page.getByTestId('passport-workspace')).toHaveAttribute(
      'data-book-state',
      'opening',
    );
    await player.page.waitForTimeout(180);
    await player.page.screenshot({
      path: testInfo.outputPath('cover-opening-desktop.png'),
      fullPage: true,
    });
    await expect(
      player.page.getByRole('button', { name: 'Play as Guest', exact: true }),
    ).toBeVisible();
    await expect(player.page.getByLabel('Your name', { exact: true })).toHaveCount(1);
    const avatar = player.page.locator('.passport-photo img').first();
    const originalAvatar = await avatar.getAttribute('src');
    await player.page.getByRole('button', { name: 'Change avatar', exact: true }).click();
    await expect.poll(() => avatar.getAttribute('src')).not.toBe(originalAvatar);
    const chosenAvatar = await avatar.getAttribute('src');
    await player.page.getByRole('button', { name: /^login(?: coming soon)?$/i }).click();
    await expect(
      player.page.getByRole('status').filter({ hasText: /Login coming soon/ }),
    ).toBeVisible();
    await inspectLayout(player.page, testInfo, 'identity-before-guest');
    await player.page.getByLabel('Your name', { exact: true }).fill('Ava');
    await player.page.getByRole('button', { name: 'Play as Guest', exact: true }).click();
    await player.page
      .getByRole('dialog', { name: /^how to play$/i })
      .getByRole('button', { name: /^got it - let's play$/i })
      .click();
    await expect(player.page.getByRole('button', { name: 'Join room', exact: true })).toBeVisible();
    // The fields reflow into a vertical phone page and a genuine desktop spread.
    for (const width of [320, 1440]) {
      await player.page.setViewportSize({ width, height: 900 });
      const identity = await player.page.getByLabel('Your name', { exact: true }).boundingBox();
      const roomCode = await player.page.getByLabel('Room code', { exact: true }).boundingBox();
      expect(identity).not.toBeNull();
      expect(roomCode).not.toBeNull();
      if (width === 320) expect(roomCode!.y).toBeGreaterThan(identity!.y + identity!.height);
      else expect(roomCode!.x).toBeGreaterThan(identity!.x + identity!.width);
    }
    await player.page.getByRole('tab', { name: /^create a room$/i }).click();
    await inspectLayout(player.page, testInfo, 'home-create');
    await player.page
      .getByRole('button', { name: 'Close passport', exact: true })
      .evaluate((button) => {
        for (let index = 0; index < 5; index++) (button as HTMLButtonElement).click();
      });
    await expect(player.page.getByTestId('passport-workspace')).toHaveAttribute(
      'data-book-state',
      'closing',
    );
    await player.page.waitForTimeout(180);
    await player.page.screenshot({
      path: testInfo.outputPath('cover-closing-desktop.png'),
      fullPage: true,
    });
    await expect(
      player.page.getByRole('button', { name: 'Open passport', exact: true }),
    ).toBeVisible();
    await expect(player.page.getByLabel('Your name', { exact: true })).toBeHidden();
    await player.page.setViewportSize({ width: 320, height: 700 });
    await player.page.getByRole('button', { name: 'Open passport', exact: true }).click();
    await player.page.waitForTimeout(180);
    await player.page.screenshot({
      path: testInfo.outputPath('cover-opening-mobile.png'),
      fullPage: true,
    });
    expect(
      await player.page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await expect(player.page.getByLabel('Your name', { exact: true })).toHaveValue('Ava');
    await expect(avatar).toHaveAttribute('src', chosenAvatar!);
    await player.page.getByRole('tab', { name: /^join a room$/i }).click();
    await expect(player.page.getByRole('button', { name: 'Join room', exact: true })).toBeVisible();
    await player.page.reload();
    await expect(player.page.getByTestId('passport-workspace')).toHaveAttribute(
      'data-book-state',
      'open',
    );
    await expect(player.page.getByLabel('Your name', { exact: true })).toHaveValue('Ava');
    await expect(avatar).toHaveAttribute('src', chosenAvatar!);
    expect(player.errors).toEqual([]);
  } finally {
    await closePlayers([player]);
  }
});

test('reduced motion opens the same usable passport without a sustained animation', async ({
  browser,
}, testInfo) => {
  const player = await openPlayer(browser, 'Maya', false);
  try {
    await player.page.emulateMedia({ reducedMotion: 'reduce' });
    await player.page.setViewportSize({ width: 320, height: 700 });
    const openButton = player.page.getByRole('button', { name: 'Open passport', exact: true });
    await expect(openButton).toBeEnabled();
    await openButton.focus();
    await expect(openButton).toBeFocused();
    await player.page.keyboard.press('Enter');
    await expect(
      player.page.getByRole('button', { name: 'Play as Guest', exact: true }),
    ).toBeVisible();
    const sustainedAnimations = await player.page.evaluate(
      () =>
        document.getAnimations().filter((animation) => {
          const duration = animation.effect?.getComputedTiming().duration;
          return (
            animation.playState === 'running' && typeof duration === 'number' && duration > 100
          );
        }).length,
    );
    expect(sustainedAnimations).toBe(0);
    await player.page.getByLabel('Your name', { exact: true }).fill('Maya');
    await player.page.getByRole('button', { name: 'Play as Guest', exact: true }).click();
    await player.page
      .getByRole('dialog', { name: /^how to play$/i })
      .getByRole('button', { name: /^got it - let's play$/i })
      .click();
    await inspectLayout(player.page, testInfo, 'reduced-motion-open', false);
    await player.page.getByRole('button', { name: 'Close passport', exact: true }).click();
    await expect(
      player.page.getByRole('button', { name: 'Open passport', exact: true }),
    ).toBeVisible();
    expect(player.errors).toEqual([]);
  } finally {
    await closePlayers([player]);
  }
});
