import {
  expect,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test';
import type { ClientState, Phase } from '../../src/lib/shared/types';

export interface PlayerBrowser {
  name: string;
  context: BrowserContext;
  page: Page;
  snapshots: ClientState[];
  payloads: string[];
  websocketUrls: string[];
  errors: string[];
}

export async function openPlayer(
  browser: Browser,
  name: string,
  enter = true,
): Promise<PlayerBrowser> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const player: PlayerBrowser = { name, context, page, snapshots: [], payloads: [], websocketUrls: [], errors: [] };
  page.on('pageerror', (error) => player.errors.push(error.message));
  page.on('websocket', (socket) => {
    player.websocketUrls.push(socket.url());
    socket.on('framereceived', ({ payload }) => {
      const raw = payload.toString();
      player.payloads.push(raw);
      if (!raw.startsWith('42[')) return;
      const event = JSON.parse(raw.slice(2)) as [string, ClientState];
      if (event[0] === 'room:state') player.snapshots.push(event[1]);
    });
  });
  await page.goto('/');
  if (enter) await enterPassport(page, name);
  return player;
}

export async function enterPassport(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Open passport', exact: true }).click();
  await page.getByLabel('Your name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Play as Guest', exact: true }).click();
  await page
    .getByRole('dialog', { name: /^how to play$/i })
    .getByRole('button', { name: /^got it - let's play$/i })
    .click();
  await expect(page.getByRole('button', { name: 'Join room', exact: true })).toBeVisible();
}

export function state(player: PlayerBrowser): ClientState {
  const latest = player.snapshots.at(-1);
  if (!latest) throw new Error(`No room state received by ${player.name}.`);
  return latest;
}

export async function waitPhase(players: PlayerBrowser[], phase: Phase): Promise<void> {
  await expect
    .poll(() => players.map((player) => player.snapshots.at(-1)?.phase))
    .toEqual(players.map(() => phase));
}

export async function createRoom(player: PlayerBrowser): Promise<string> {
  const previousSnapshots = player.snapshots.length;
  await player.page.getByLabel('Your name', { exact: true }).fill(player.name);
  await player.page.getByRole('tab', { name: /^create a room$/i }).click();
  await player.page.getByRole('button', { name: 'Create room', exact: true }).click();
  await expect.poll(() => player.snapshots.length).toBeGreaterThan(previousSnapshots);
  await waitPhase([player], 'LOBBY');
  expect(state(player).roomCode).toMatch(/^[A-Z0-9]{6}$/);
  return state(player).roomCode;
}

export async function joinRoom(player: PlayerBrowser, roomCode: string): Promise<void> {
  await player.page.getByLabel('Your name', { exact: true }).fill(player.name);
  await player.page.getByRole('tab', { name: /^join a room$/i }).click();
  await player.page.getByLabel('Room code', { exact: true }).fill(roomCode);
  await player.page.getByRole('button', { name: 'Join room', exact: true }).click();
  await waitPhase([player], 'LOBBY');
}

export async function party(
  browser: Browser,
  names = ['Ava', 'Zain', 'Maya', 'Omar', 'Lina', 'Theo'],
): Promise<PlayerBrowser[]> {
  const players: PlayerBrowser[] = [];
  try {
    for (const name of names) players.push(await openPlayer(browser, name));
    const roomCode = await createRoom(players[0]);
    for (const player of players.slice(1)) await joinRoom(player, roomCode);
    await expect.poll(() => state(players[0]).players.length).toBe(names.length);
    return players;
  } catch (error) {
    await closePlayers(players);
    throw error;
  }
}

export async function closePlayers(players: PlayerBrowser[]): Promise<void> {
  await Promise.allSettled(players.map((player) => player.context.close()));
}

export function host(players: PlayerBrowser[]): PlayerBrowser {
  const current = players.find((player) => state(player).youId === state(player).hostPlayerId);
  if (!current) throw new Error('No connected host found.');
  return current;
}

export function tourist(players: PlayerBrowser[]): PlayerBrowser {
  const tourists = players.filter((player) => state(player).role === 'TOURIST');
  expect(tourists).toHaveLength(1);
  return tourists[0];
}

export async function startRound(players: PlayerBrowser[], next = false): Promise<void> {
  await host(players)
    .page.getByRole('button', { name: next ? 'Next round' : 'Start game', exact: true })
    .click();
  await waitPhase(players, 'ROLE_REVEAL');
  const secret = tourist(players);
  expect(state(secret)).not.toHaveProperty('country');
  const travelers = players.filter((player) => player !== secret);
  const country = state(travelers[0]).country;
  expect(country).toBeDefined();
  for (const traveler of travelers) expect(state(traveler).country).toEqual(country);
}

export async function readyEveryone(players: PlayerBrowser[]): Promise<void> {
  for (const player of players) await player.page.getByRole('button', { name: /ready/i }).click();
  await waitPhase(players, 'DISCUSSION');
}

export async function startVote(players: PlayerBrowser[]): Promise<void> {
  await host(players).page.getByRole('button', { name: 'Start vote', exact: true }).click();
  await waitPhase(players, 'VOTING');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function vote(player: PlayerBrowser, target: PlayerBrowser): Promise<void> {
  await player.page.getByRole('button', { name: new RegExp(escapeRegex(target.name)) }).click();
  await player.page.getByRole('button', { name: 'Flag passport', exact: true }).click();
}

export async function catchTourist(players: PlayerBrowser[]): Promise<PlayerBrowser> {
  const secret = tourist(players);
  const traveler = players.find((player) => player !== secret)!;
  for (const player of players) await vote(player, player === secret ? traveler : secret);
  await waitPhase(players, 'FINAL_GUESS');
  for (const player of players) {
    if (player === secret) await expect(player.page.getByLabel('Search countries')).toBeVisible();
    else await expect(player.page.getByLabel('Search countries')).toHaveCount(0);
  }
  return secret;
}

export async function guessCountry(player: PlayerBrowser, countryName: string): Promise<void> {
  await player.page.getByLabel('Search countries').fill(countryName);
  await player.page.getByRole('button', { name: countryName, exact: true }).click();
  await player.page.getByRole('button', { name: 'Submit guess', exact: true }).click();
}

export const VIEWPORTS = [
  { width: 320, height: 700 },
  { width: 360, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

/** Geometry checks complement the captured screenshots; screenshots still need human review. */
export async function inspectLayout(
  page: Page,
  testInfo: TestInfo,
  screen: string,
  allWidths = true,
): Promise<void> {
  const viewports = allWidths
    ? VIEWPORTS
    : VIEWPORTS.filter(({ width }) => [320, 390, 768, 1280, 1440].includes(width));
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => undefined)),
      ),
    );
    const problems = await page.evaluate(() => {
      const problems: string[] = [];
      if (document.documentElement.scrollWidth > document.documentElement.clientWidth)
        problems.push('Horizontal page overflow');
      const controls = [...document.querySelectorAll<HTMLElement>('button, input, select')].filter(
        (element) =>
          element.getClientRects().length &&
          element.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
      );
      for (const text of document.querySelectorAll<HTMLElement>(
        'h1, h2, h3, button, label, .player-name, .timer-value, .country-name',
      )) {
        if (
          text.checkVisibility({ opacityProperty: true, visibilityProperty: true }) &&
          text.clientWidth > 0 &&
          text.scrollWidth > text.clientWidth + 1
        ) {
          problems.push(`Text exceeds its container: ${text.textContent?.trim()}`);
        }
      }
      function paintedBounds(element: HTMLElement) {
        const bounds = element.getBoundingClientRect();
        const painted = {
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
          bottom: bounds.bottom,
        };
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          const box = parent.getBoundingClientRect();
          // Offscreen list options retain layout boxes, but their overflow container clips
          // their paint. Compare the actual painted regions, including partially visible rows.
          if (['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX)) {
            painted.left = Math.max(painted.left, box.left + parent.clientLeft);
            painted.right = Math.min(
              painted.right,
              box.left + parent.clientLeft + parent.clientWidth,
            );
          }
          if (['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowY)) {
            painted.top = Math.max(painted.top, box.top + parent.clientTop);
            painted.bottom = Math.min(
              painted.bottom,
              box.top + parent.clientTop + parent.clientHeight,
            );
          }
        }
        return painted;
      }
      for (const control of controls) {
        const bounds = control.getBoundingClientRect();
        if (bounds.left < -1 || bounds.right > innerWidth + 1)
          problems.push(
            `Control extends past viewport: ${control.textContent || control.getAttribute('aria-label') || control.id}`,
          );
        if (bounds.height < 44)
          problems.push(`Control is too short: ${control.textContent || control.id}`);
      }
      for (let i = 0; i < controls.length; i++) {
        for (let j = i + 1; j < controls.length; j++) {
          const a = paintedBounds(controls[i]);
          const b = paintedBounds(controls[j]);
          if (
            Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
          ) {
            problems.push(
              `Controls overlap: ${controls[i].textContent} / ${controls[j].textContent}`,
            );
          }
        }
      }
      return problems;
    });
    expect(problems, `${screen} at ${viewport.width}px`).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`${screen}-${viewport.width}.png`),
      fullPage: true,
    });
  }
}
