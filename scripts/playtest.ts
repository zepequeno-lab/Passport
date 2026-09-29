import { chromium, type Browser } from '@playwright/test';

const url = process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5173';
const names = ['Ava', 'Zain', 'Maya', 'Omar', 'Lina', 'Theo'];
const smoke = process.argv.includes('--smoke');
let browser: Browser | undefined;

async function close(): Promise<void> {
  await browser?.close();
  process.exit(0);
}

process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());

try {
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`The app returned HTTP ${response.status}.`);
  browser = await chromium.launch({ headless: smoke });
  let roomCode = '';
  for (const [index, name] of names.entries()) {
    const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    const page = await context.newPage();
    const joined = new Promise<string>((resolve) => {
      page.on('websocket', (socket) => {
        socket.on('framereceived', ({ payload }) => {
          const raw = payload.toString();
          if (!raw.startsWith('42[')) return;
          const event = JSON.parse(raw.slice(2)) as [string, { roomCode?: string }];
          if (event[0] === 'room:state' && event[1].roomCode) resolve(event[1].roomCode);
        });
      });
    });
    await page.goto(url);
    await page.getByRole('button', { name: 'Open passport', exact: true }).click();
    await page.getByLabel('Your name', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Play as Guest', exact: true }).click();
    await page
      .getByRole('dialog', { name: /^how to play$/i })
      .getByRole('button', { name: /^got it - let's play$/i })
      .click();
    if (index === 0) {
      await page.getByRole('tab', { name: /^create a room$/i }).click();
      await page.getByRole('button', { name: 'Create room', exact: true }).click();
    } else {
      await page.getByRole('tab', { name: /^join a room$/i }).click();
      await page.getByLabel('Room code', { exact: true }).fill(roomCode);
      await page.getByRole('button', { name: 'Join room', exact: true }).click();
    }
    let joinTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      roomCode = await Promise.race([
        joined,
        new Promise<never>((_, reject) => {
          joinTimeout = setTimeout(
            () => reject(new Error(`${name} could not join the room within 15 seconds.`)),
            15_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(joinTimeout);
    }
  }
  console.log(`Six independent players joined room ${roomCode}.`);
  if (smoke) {
    console.log('Smoke check passed. Closing all six independent browser contexts.');
    await browser.close();
  } else {
    console.log('Ava is the host. Choose Start game in her window, then play each player’s role.');
    console.log(
      'Each window has isolated session storage. No bots choose actions or reveal secrets.',
    );
    console.log('Keep this terminal open. Press Ctrl+C to close all six windows.');
    await new Promise<void>((resolve) => browser!.once('disconnected', () => resolve()));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(
    'Start the app with npm run dev, and install Chromium with npx playwright install chromium.',
  );
  await browser?.close();
  process.exitCode = 1;
}
