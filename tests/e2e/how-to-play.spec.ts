import { expect, test, type Page } from '@playwright/test';
import { closePlayers, createRoom, joinRoom, openPlayer, state, waitPhase } from './helpers';

const dialogName = /^how to play$/i;
const continueName = /^got it - let's play$/i;
const viewports = [
  { width: 320, height: 700 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
];

async function openIdentity(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Open passport', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play as Guest', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: dialogName, exact: true })).toHaveCount(0);
}

async function finishAnimations(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

async function focusedInsideDialog(page: Page): Promise<boolean> {
  return page
    .getByRole('dialog', { name: dialogName, exact: true })
    .evaluate((dialog) => dialog.contains(document.activeElement));
}

test('guest onboarding gates room controls, supports keyboard use, and can reopen in a created room', async ({
  browser,
}) => {
  const player = await openPlayer(browser, 'Ava', false);
  const dialog = player.page.getByRole('dialog', { name: dialogName, exact: true });
  try {
    await expect(dialog).toHaveCount(0);
    await openIdentity(player.page);
    await expect(player.page.getByRole('button', { name: dialogName, exact: true })).toHaveCount(0);
    // The present Login placeholder is not a successful identity completion.
    await player.page.getByRole('button', { name: /^login(?: coming soon)?$/i }).click();
    await expect(
      player.page.getByRole('status').filter({ hasText: /Login coming soon/ }),
    ).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await player.page.getByLabel('Your name', { exact: true }).fill(player.name);
    await player.page.getByRole('button', { name: 'Play as Guest', exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(player.page.locator('.guest-actions')).toContainText('Guest passport ready');
    expect(player.snapshots).toHaveLength(0);
    await expect.poll(() => focusedInsideDialog(player.page)).toBe(true);

    // A background input cannot steal keyboard focus while the instructions are open.
    await player.page
      .locator('#room-code')
      .evaluate((input) => (input as HTMLInputElement).focus());
    expect(await focusedInsideDialog(player.page)).toBe(true);
    const tabStops = await dialog.getByRole('button').count();
    for (let index = 0; index < tabStops + 2; index++) {
      await player.page.keyboard.press('Tab');
      expect(await focusedInsideDialog(player.page)).toBe(true);
    }
    for (let index = 0; index < tabStops + 2; index++) {
      await player.page.keyboard.press('Shift+Tab');
      expect(await focusedInsideDialog(player.page)).toBe(true);
    }
    await dialog.getByRole('button', { name: continueName, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(player.page.getByLabel('Your name', { exact: true })).toHaveValue(player.name);
    const roomCode = await createRoom(player);
    expect(state(player).players[0].displayName).toBe(player.name);

    const help = player.page.getByRole('button', { name: dialogName, exact: true });
    await help.click();
    await expect(dialog).toBeVisible();
    await player.page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(help).toBeFocused();
    expect(state(player).roomCode).toBe(roomCode);
    await help.click();
    await dialog.getByRole('button', { name: continueName, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(help).toBeFocused();

    await player.page.reload();
    await expect(
      player.page.getByRole('button', { name: 'Start game', exact: true }),
    ).toBeVisible();
    await waitPhase([player], 'LOBBY');
    await expect(dialog).toHaveCount(0);
    await player.page.getByRole('button', { name: 'Leave room', exact: true }).click();
    await expect(player.page.getByRole('button', { name: 'Join room', exact: true })).toBeVisible();
    await expect(dialog).toHaveCount(0);
    expect(player.errors).toEqual([]);
  } finally {
    await closePlayers([player]);
  }
});

test('each fresh guest sees onboarding and can join an existing room after continuing', async ({
  browser,
}) => {
  const host = await openPlayer(browser, 'Host');
  const joining = await openPlayer(browser, 'New guest', false);
  try {
    const roomCode = await createRoom(host);
    await openIdentity(joining.page);
    await joining.page.getByLabel('Your name', { exact: true }).fill(joining.name);
    await joining.page.getByRole('button', { name: 'Play as Guest', exact: true }).click();
    const dialog = joining.page.getByRole('dialog', { name: dialogName, exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: continueName, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await joinRoom(joining, roomCode);
    await expect.poll(() => state(host).players.length).toBe(2);
    expect(state(joining).roomCode).toBe(roomCode);
    await joining.page.reload();
    await expect(
      joining.page.getByRole('button', { name: 'Leave room', exact: true }),
    ).toBeVisible();
    await expect(dialog).toHaveCount(0);
    for (const player of [host, joining]) expect(player.errors).toEqual([]);
  } finally {
    await closePlayers([host, joining]);
  }
});

test('the instruction insert fits every required viewport with a visible CTA and locked background', async ({
  browser,
}, testInfo) => {
  const player = await openPlayer(browser, 'Maya', false);
  try {
    await openIdentity(player.page);
    await player.page.getByRole('button', { name: 'Play as Guest', exact: true }).click();
    const dialog = player.page.getByRole('dialog', { name: dialogName, exact: true });
    await expect(dialog).toBeVisible();
    for (const title of [
      /^check your passport$/i,
      /^ask questions$/i,
      /^blend in$/i,
      /^vote$/i,
      /^final chance$/i,
    ]) {
      await expect(dialog.getByText(title)).toBeVisible();
    }
    expect(await dialog.innerText()).not.toMatch(/[\u2013\u2014]|--/);
    for (const viewport of viewports) {
      await player.page.setViewportSize(viewport);
      await player.page.evaluate(() => document.fonts.ready);
      await finishAnimations(player.page);
      const problems = await dialog.evaluate((element) => {
        const problems: string[] = [];
        const modal = element.getBoundingClientRect();
        if (Math.abs(modal.left + modal.width / 2 - innerWidth / 2) > 1)
          problems.push('Dialog is not horizontally centered');
        if (
          modal.left < -1 ||
          modal.right > innerWidth + 1 ||
          modal.top < -1 ||
          modal.bottom > innerHeight + 1
        )
          problems.push('Dialog escapes viewport');
        if (document.documentElement.scrollWidth > document.documentElement.clientWidth)
          problems.push('Horizontal page scrolling');
        const buttons = [...element.querySelectorAll<HTMLButtonElement>('button')].filter(
          (button) => button.checkVisibility(),
        );
        for (const button of buttons) {
          const box = button.getBoundingClientRect();
          if (box.height < 44 || box.width < 44)
            problems.push(`Small touch target: ${button.textContent}`);
          if (
            box.left < modal.left - 1 ||
            box.right > modal.right + 1 ||
            box.top < modal.top - 1 ||
            box.bottom > modal.bottom + 1
          )
            problems.push(`Button escapes dialog: ${button.textContent}`);
          if (box.top < -1 || box.bottom > innerHeight + 1)
            problems.push(`Button is outside viewport: ${button.textContent}`);
        }
        for (const text of element.querySelectorAll<HTMLElement>('h1, h2, h3, p, button')) {
          if (text.clientWidth && text.scrollWidth > text.clientWidth + 1)
            problems.push(`Text clips horizontally: ${text.textContent}`);
        }
        const steps = element.querySelector<HTMLElement>('.instruction-steps');
        if (steps && steps.scrollHeight > steps.clientHeight + 1)
          problems.push('Instructions require scrolling at a required viewport');
        for (let index = 1; index < buttons.length; index++) {
          const a = buttons[index - 1].getBoundingClientRect();
          const b = buttons[index].getBoundingClientRect();
          if (
            Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 &&
            Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1
          )
            problems.push('Modal buttons overlap');
        }
        return problems;
      });
      expect(problems, `How to play at ${viewport.width}px`).toEqual([]);
      const scrollBefore = await player.page.evaluate(() => window.scrollY);
      await player.page.mouse.move(1, 1);
      await player.page.mouse.wheel(0, 700);
      await player.page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      expect(await player.page.evaluate(() => window.scrollY)).toBe(scrollBefore);
      await player.page.screenshot({
        path: testInfo.outputPath(`how-to-play-${viewport.width}.png`),
      });
    }
    await dialog.getByRole('button', { name: continueName, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(player.errors).toEqual([]);
  } finally {
    await closePlayers([player]);
  }
});

test('keyboard guest entry respects reduced motion and closes with Escape', async ({ browser }) => {
  const player = await openPlayer(browser, 'Theo', false);
  try {
    await player.page.emulateMedia({ reducedMotion: 'reduce' });
    await player.page.setViewportSize({ width: 320, height: 700 });
    await openIdentity(player.page);
    const guest = player.page.getByRole('button', { name: 'Play as Guest', exact: true });
    await expect(guest).toBeEnabled();
    await guest.focus();
    await expect(guest).toBeFocused();
    await player.page.keyboard.press('Enter');
    const dialog = player.page.getByRole('dialog', { name: dialogName, exact: true });
    await expect(dialog).toBeVisible();
    const sustainedAnimations = await dialog.evaluate(
      (element) =>
        element.getAnimations({ subtree: true }).filter((animation) => {
          const duration = animation.effect?.getComputedTiming().duration;
          return (
            animation.playState === 'running' && typeof duration === 'number' && duration > 100
          );
        }).length,
    );
    expect(sustainedAnimations).toBe(0);
    await player.page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(
      await player.page.evaluate(
        () =>
          document.activeElement !== document.body &&
          document.activeElement?.matches(
            'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
          ),
      ),
    ).toBe(true);
    expect(player.errors).toEqual([]);
  } finally {
    await closePlayers([player]);
  }
});
