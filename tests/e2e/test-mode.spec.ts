import { expect, test } from '@playwright/test';
import {
  closePlayers,
  guessCountry,
  host,
  party,
  readyEveryone,
  startRound,
  startVote,
  state,
  tourist,
  vote,
  waitPhase,
} from './helpers';

test('two independent development clients complete Test Mode with private roles, reconnect, final guess, and next round', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const players = await party(browser, ['Test host', 'Remote friend']);
  try {
    const initialHost = host(players);
    const friend = players.find((player) => player !== initialHost)!;
    await friend.page.setViewportSize({ width: 390, height: 844 });
    expect(initialHost.context).not.toBe(friend.context);
    expect(state(initialHost)).toMatchObject({ testMode: false, minPlayers: 4 });
    expect(state(initialHost).players).toHaveLength(2);
    await expect(
      initialHost.page.getByRole('button', { name: 'Start game', exact: true }),
    ).toBeDisabled();
    await expect(friend.page.getByRole('switch')).toHaveCount(0);
    if (!state(initialHost).testModeAvailable) {
      for (const player of players) {
        expect(state(player)).toMatchObject({ testModeAvailable: false, testMode: false, minPlayers: 4 });
        await expect(player.page.getByRole('switch')).toHaveCount(0);
      }
      test.skip(true, 'Production keeps the four-player minimum and does not expose Test Mode.');
    }
    for (const player of players) {
      const pageOrigin = new URL(player.page.url());
      const gameSockets = player.websocketUrls.map((url) => new URL(url)).filter((url) => url.pathname === '/socket.io/');
      expect(gameSockets.length, `${player.name} opened a Socket.IO WebSocket`).toBeGreaterThan(0);
      for (const socketUrl of gameSockets) {
        expect(socketUrl.hostname).toBe(pageOrigin.hostname);
        expect(socketUrl.port).toBe(pageOrigin.port);
        expect(socketUrl.protocol).toBe(pageOrigin.protocol === 'https:' ? 'wss:' : 'ws:');
      }
    }
    const toggle = initialHost.page.getByRole('switch', { name: 'Enable 2 player test mode' });
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect
      .poll(() => players.map((player) => [state(player).testMode, state(player).minPlayers]))
      .toEqual([
        [true, 2],
        [true, 2],
      ]);
    for (const player of players) {
      await expect(
        player.page.getByRole('status').filter({ hasText: 'TEST MODE - 2 PLAYER DEV TEST' }),
      ).toBeVisible();
    }
    expect(
      await friend.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await friend.page.screenshot({
      path: testInfo.outputPath('test-mode-lobby-mobile.png'),
      fullPage: true,
    });

    await startRound(players);
    const secret = tourist(players);
    const traveler = players.find((player) => player !== secret)!;
    const country = state(traveler).country!;
    const touristId = state(secret).youId;
    const beforeRefresh = secret.snapshots.length;
    await secret.page.reload();
    await expect.poll(() => secret.snapshots.length).toBeGreaterThan(beforeRefresh);
    await expect(secret.page.getByRole('button', { name: /ready/i })).toBeVisible();
    expect(state(secret)).toMatchObject({
      youId: touristId,
      role: 'TOURIST',
      testMode: true,
      minPlayers: 2,
      phase: 'ROLE_REVEAL',
    });
    expect(state(secret)).not.toHaveProperty('country');
    expect(state(traveler).country).toEqual(country);
    await readyEveryone(players);

    // Leaving the page closes the real socket; returning restores the browser's existing session.
    const reconnecting = host(players);
    const observer = players.find((player) => player !== reconnecting)!;
    const reconnectingState = state(reconnecting);
    const beforeReconnect = reconnecting.snapshots.length;
    await reconnecting.page.goto('about:blank');
    await expect
      .poll(
        () =>
          state(observer).players.find((player) => player.id === reconnectingState.youId)
            ?.connected,
      )
      .toBe(false);
    await expect.poll(() => state(observer).hostPlayerId).toBe(state(observer).youId);
    await reconnecting.page.goto('/');
    await expect.poll(() => reconnecting.snapshots.length).toBeGreaterThan(beforeReconnect);
    await waitPhase(players, 'DISCUSSION');
    expect(state(reconnecting)).toMatchObject({
      youId: reconnectingState.youId,
      role: reconnectingState.role,
      deadline: reconnectingState.deadline,
      testMode: true,
      minPlayers: 2,
    });
    await expect.poll(() => state(observer).players.every((player) => player.connected)).toBe(true);
    expect(state(secret)).not.toHaveProperty('country');
    await expect(
      reconnecting.page.getByRole('status').filter({ hasText: /Your place in the room is saved/ }),
    ).toBeVisible();

    await startVote(players);
    await vote(traveler, secret);
    await expect(traveler.page.getByText('Vote submitted', { exact: true })).toBeVisible();
    const voting = state(traveler);
    // The Tourist abstains so the ordinary deadline can resolve a single accusation.
    const votingTimeout =
      Math.max(0, (voting.deadline ?? voting.serverNow) - voting.serverNow) + 10_000;
    await expect
      .poll(() => players.map((player) => state(player).phase), { timeout: votingTimeout })
      .toEqual(['FINAL_GUESS', 'FINAL_GUESS']);
    await expect(secret.page.getByLabel('Search countries')).toBeVisible();
    await expect(traveler.page.getByLabel('Search countries')).toHaveCount(0);
    for (const snapshot of secret.snapshots.filter((snapshot) => snapshot.roundNumber === 1)) {
      expect(snapshot.role).toBe('TOURIST');
      expect(snapshot).not.toHaveProperty('country');
      expect(snapshot).not.toHaveProperty('results');
      expect(JSON.stringify(snapshot)).not.toContain(`"name":"${country.name}"`);
      expect(JSON.stringify(snapshot)).not.toContain('currentCountry');
      expect(JSON.stringify(snapshot)).not.toContain('touristPlayerId');
    }
    await guessCountry(secret, country.name);
    await waitPhase(players, 'RESULTS');
    for (const player of players) {
      expect(state(player).results).toMatchObject({
        country,
        touristPlayerId: touristId,
        touristGuess: country,
        winner: 'TOURIST',
      });
      expect(state(player).results?.votes).toHaveLength(1);
    }
    await friend.page.screenshot({
      path: testInfo.outputPath('test-mode-results-mobile.png'),
      fullPage: true,
    });

    await startRound(players, true);
    expect(state(players[0]).roundNumber).toBe(2);
    expect(state(players[0]).testMode).toBe(true);
    expect(state(players[0]).players.every((player) => !player.ready && !player.hasVoted)).toBe(
      true,
    );
    expect(tourist(players)).not.toBe(secret);
    expect(state(players.find((player) => player !== tourist(players))!).country?.id).not.toBe(
      country.id,
    );
    await readyEveryone(players);
    await startVote(players);
    await vote(players[0], players[1]);
    await vote(players[1], players[0]);
    await waitPhase(players, 'RESULTS');
    expect(state(players[0]).results).toMatchObject({ winner: 'TOURIST', touristGuess: null });
    expect(state(players[0]).results?.reason.toLowerCase()).toContain('tie');
    for (const player of players) expect(player.errors, player.name).toEqual([]);
  } finally {
    await closePlayers(players);
  }
});
