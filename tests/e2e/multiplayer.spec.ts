import { expect, test } from '@playwright/test';
import { COUNTRIES } from '../../src/lib/shared/countries';
import {
  catchTourist,
  closePlayers,
  createRoom,
  guessCountry,
  host,
  inspectLayout,
  openPlayer,
  party,
  readyEveryone,
  startRound,
  startVote,
  state,
  tourist,
  vote,
  waitPhase,
} from './helpers';

test('six independent browsers complete correct guess, wrong guess, tie, refresh, and leave flows', async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const players = await party(browser);
  try {
    await inspectLayout(players[0].page, testInfo, 'lobby-six', false);
    await players[0].context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await players[0].page.getByRole('button', { name: 'Copy room code', exact: true }).click();
    expect(await players[0].page.evaluate(() => navigator.clipboard.readText())).toBe(
      state(players[0]).roomCode,
    );
    await expect(
      players[0].page.getByRole('button', { name: 'Room code copied', exact: true }),
    ).toBeVisible();
    await startRound(players);
    const firstCountry = state(players.find((player) => player !== tourist(players))!).country!;

    // Reload the host and another traveler using only their own stored resume credentials.
    const originalHost = host(players);
    const originalHostId = state(originalHost).youId;
    await originalHost.page.reload();
    await expect.poll(() => state(originalHost).youId).toBe(originalHostId);
    await expect(originalHost.page.getByRole('button', { name: /ready/i })).toBeVisible();
    const refreshedTraveler = players.find(
      (player) => player !== originalHost && state(player).role === 'TRAVELER',
    )!;
    const travelerId = state(refreshedTraveler).youId;
    await refreshedTraveler.page.reload();
    await expect(refreshedTraveler.page.getByRole('button', { name: /ready/i })).toBeVisible();
    expect(state(refreshedTraveler).youId).toBe(travelerId);
    expect(state(refreshedTraveler).country).toEqual(firstCountry);
    await inspectLayout(refreshedTraveler.page, testInfo, 'reconnected-traveler', false);
    await refreshedTraveler.page
      .getByRole('button', { name: 'Dismiss notice', exact: true })
      .click();
    await expect(
      refreshedTraveler.page.getByRole('button', { name: 'Dismiss notice', exact: true }),
    ).toHaveCount(0);
    const refreshedTourist = tourist(players);
    const touristId = state(refreshedTourist).youId;
    await refreshedTourist.page.reload();
    await expect(refreshedTourist.page.getByRole('button', { name: /ready/i })).toBeVisible();
    expect(state(refreshedTourist).youId).toBe(touristId);
    expect(state(refreshedTourist)).not.toHaveProperty('country');

    await readyEveryone(players);
    await refreshedTraveler.page
      .getByRole('button', { name: 'Reveal country', exact: true })
      .click();
    await expect(
      refreshedTraveler.page.getByText(firstCountry.name, { exact: true }),
    ).toBeVisible();
    await refreshedTraveler.page.getByRole('button', { name: 'Hide country', exact: true }).click();
    await expect(refreshedTraveler.page.getByText(firstCountry.name, { exact: true })).toHaveCount(
      0,
    );
    const discussionDeadline = state(refreshedTraveler).deadline;
    await refreshedTraveler.context.setOffline(true);
    await expect(
      refreshedTraveler.page.getByRole('status').filter({ hasText: /Connection lost/ }),
    ).toBeVisible({ timeout: 30_000 });
    await inspectLayout(refreshedTraveler.page, testInfo, 'disconnected-discussion', false);
    await refreshedTraveler.context.setOffline(false);
    await expect(
      refreshedTraveler.page
        .getByRole('status')
        .filter({ hasText: /Your place in the room is saved/ }),
    ).toBeVisible();
    expect(state(refreshedTraveler).youId).toBe(travelerId);
    expect(state(refreshedTraveler).country).toEqual(firstCountry);
    expect(state(refreshedTraveler).deadline).toBe(discussionDeadline);
    await startVote(players);
    const firstTourist = await catchTourist(players);
    // Inspect every game payload received by the Tourist before any answer is submitted.
    for (const snapshot of firstTourist.snapshots.filter(
      (snapshot) => snapshot.role === 'TOURIST',
    )) {
      expect(snapshot).not.toHaveProperty('country');
      expect(snapshot).not.toHaveProperty('results');
      expect(JSON.stringify(snapshot)).not.toContain(`"name":"${firstCountry.name}"`);
      expect(JSON.stringify(snapshot)).not.toContain('currentCountry');
      expect(JSON.stringify(snapshot)).not.toContain('touristPlayerId');
    }
    await guessCountry(firstTourist, firstCountry.name);
    await waitPhase(players, 'RESULTS');
    for (const player of players) {
      expect(state(player).results).toMatchObject({
        country: firstCountry,
        winner: 'TOURIST',
        touristGuess: firstCountry,
      });
      expect(state(player).results?.votes).toHaveLength(6);
    }

    await startRound(players, true);
    expect(state(players[0]).roundNumber).toBe(2);
    expect(state(players[0]).results).toBeUndefined();
    expect(state(players[0]).players.every((player) => !player.hasVoted && !player.ready)).toBe(
      true,
    );
    const secondCountry = state(
      players.find((player) => state(player).role === 'TRAVELER')!,
    ).country!;
    expect(secondCountry.id).not.toBe(firstCountry.id);
    await readyEveryone(players);
    await startVote(players);
    const secondTourist = await catchTourist(players);
    const wrongCountry = COUNTRIES.find((country) => country.id !== secondCountry.id)!;
    await guessCountry(secondTourist, wrongCountry.name);
    await waitPhase(players, 'RESULTS');
    expect(state(players[0]).results).toMatchObject({
      winner: 'TRAVELERS',
      touristGuess: wrongCountry,
    });

    await startRound(players, true);
    await readyEveryone(players);
    await startVote(players);
    // A 3–3 tie between two candidates; nobody votes for themselves.
    for (let index = 0; index < players.length; index++)
      await vote(players[index], index < 3 ? players[3] : players[0]);
    await waitPhase(players, 'RESULTS');
    expect(state(players[0]).results).toMatchObject({ winner: 'TOURIST', touristGuess: null });
    expect(state(players[0]).results?.reason.toLowerCase()).toContain('tie');

    await startRound(players, true);
    await readyEveryone(players);
    const departedTraveler = players.find(
      (player) => state(player).role === 'TRAVELER' && player !== host(players),
    )!;
    await departedTraveler.page.getByRole('button', { name: 'Leave room', exact: true }).click();
    await expect(
      departedTraveler.page.getByRole('button', { name: 'Join room', exact: true }),
    ).toBeVisible();
    const remaining = players.filter((player) => player !== departedTraveler);
    await expect
      .poll(() => state(remaining[0]).players.filter((player) => player.active).length)
      .toBe(5);
    await waitPhase(remaining, 'DISCUSSION');
    const departedTourist = tourist(remaining);
    await departedTourist.page.getByRole('button', { name: 'Leave room', exact: true }).click();
    await waitPhase(
      remaining.filter((player) => player !== departedTourist),
      'RESULTS',
    );
    expect(state(remaining.find((player) => player !== departedTourist)!).results?.winner).toBe(
      'TRAVELERS',
    );
    for (const player of players) expect(player.errors, player.name).toEqual([]);
  } finally {
    await closePlayers(players);
  }
});

test('ten players with long and multilingual names fit every important screen and viewport', async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const names = [
    'Zain',
    'AAAAAAAAAAAAAAAAAAAA',
    'Very Long Player Name',
    'محمد',
    '日本語',
    'Player-123_ABC',
    'Alexandra',
    'Omar',
    'Lina',
    'Theo',
  ];
  const players = await party(browser, names);
  try {
    await inspectLayout(players[0].page, testInfo, 'lobby-ten');
    const extra = await openPlayer(browser, 'Eleventh');
    try {
      await extra.page.getByLabel('Your name', { exact: true }).fill(extra.name);
      await extra.page.getByLabel('Room code', { exact: true }).fill(state(players[0]).roomCode);
      await extra.page.getByRole('button', { name: 'Join room', exact: true }).click();
      await expect(extra.page.getByRole('alert')).toContainText(/full|10/);
    } finally {
      await extra.context.close();
    }

    await startRound(players);
    const secret = tourist(players);
    const traveler = players.find((player) => player !== secret)!;
    await inspectLayout(traveler.page, testInfo, 'role-traveler');
    await inspectLayout(secret.page, testInfo, 'role-tourist');
    await readyEveryone(players);
    await inspectLayout(host(players).page, testInfo, 'discussion');
    await inspectLayout(secret.page, testInfo, 'discussion-tourist', false);
    await startVote(players);
    await inspectLayout(traveler.page, testInfo, 'voting');
    await vote(traveler, secret);
    await expect(traveler.page.getByText('Vote submitted', { exact: true })).toBeVisible();
    await inspectLayout(traveler.page, testInfo, 'vote-submitted', false);
    for (const player of players.filter((player) => player !== traveler))
      await vote(player, player === secret ? traveler : secret);
    await waitPhase(players, 'FINAL_GUESS');
    await inspectLayout(secret.page, testInfo, 'final-guess');
    await inspectLayout(traveler.page, testInfo, 'waiting-final-guess', false);
    // The longest country name is visible, selected, and submitted even at phone widths.
    await guessCountry(secret, 'United Arab Emirates');
    await waitPhase(players, 'RESULTS');
    await inspectLayout(host(players).page, testInfo, 'results');
    for (const player of players) expect(player.errors, player.name).toEqual([]);
  } finally {
    await closePlayers(players);
  }
});

test('home errors, duplicate names, minimum players, and host departure remain clear', async ({
  browser,
}, testInfo) => {
  const player = await openPlayer(browser, 'Ava');
  const players = [player];
  try {
    await inspectLayout(player.page, testInfo, 'home');
    await player.page.getByLabel('Your name', { exact: true }).fill('Ava');
    await player.page.getByLabel('Room code', { exact: true }).fill('ZZZZZZ');
    await player.page.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(player.page.getByRole('alert')).toContainText(
      /not found|does not exist|couldn.t find/i,
    );
    await inspectLayout(player.page, testInfo, 'error');
    await player.page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
    await expect(player.page.getByRole('alert')).toHaveCount(0);
    await player.page.getByRole('tab', { name: /^create a room$/i }).click();
    await player.page.getByRole('button', { name: 'Create room', exact: true }).click();
    await waitPhase([player], 'LOBBY');
    await expect(
      player.page.getByRole('button', { name: 'Start game', exact: true }),
    ).toBeDisabled();
    const duplicate = await openPlayer(browser, 'Ava');
    players.push(duplicate);
    await duplicate.page.getByLabel('Your name', { exact: true }).fill('Ava');
    await duplicate.page.getByLabel('Room code', { exact: true }).fill(state(player).roomCode);
    await duplicate.page.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(duplicate.page.getByRole('alert')).toContainText(/name|already|taken/i);
    duplicate.name = 'Zain';
    await duplicate.page.getByLabel('Your name', { exact: true }).fill(duplicate.name);
    await duplicate.page.getByRole('button', { name: 'Join room', exact: true }).click();
    await waitPhase([duplicate], 'LOBBY');
    for (const name of ['Maya', 'Omar']) {
      const joined = await openPlayer(browser, name);
      players.push(joined);
      await joined.page.getByLabel('Your name', { exact: true }).fill(name);
      await joined.page.getByLabel('Room code', { exact: true }).fill(state(player).roomCode);
      await joined.page.getByRole('button', { name: 'Join room', exact: true }).click();
      await waitPhase([joined], 'LOBBY');
    }
    await expect(
      player.page.getByRole('button', { name: 'Start game', exact: true }),
    ).toBeEnabled();
    await inspectLayout(player.page, testInfo, 'lobby-four');
    await player.page.getByRole('button', { name: 'Leave room', exact: true }).click();
    await expect.poll(() => state(duplicate).hostPlayerId).toBe(state(duplicate).youId);
    await expect(
      duplicate.page.getByRole('button', { name: 'Start game', exact: true }),
    ).toBeDisabled();
  } finally {
    await closePlayers(players);
  }
});

test('opening a saved session elsewhere restores that player and frees the replaced browser', async ({
  browser,
}) => {
  const original = await openPlayer(browser, 'Ava');
  const replacement = await openPlayer(browser, 'Ava');
  const players = [original, replacement];
  try {
    const roomCode = await createRoom(original);
    const originalId = state(original).youId;
    const savedSession = await original.page.evaluate(() =>
      sessionStorage.getItem('passport.session'),
    );
    expect(savedSession).toBeTruthy();
    await replacement.page.evaluate(
      (savedSession) => sessionStorage.setItem('passport.session', savedSession!),
      savedSession,
    );
    await replacement.page.reload();
    await waitPhase([replacement], 'LOBBY');
    expect(state(replacement).youId).toBe(originalId);
    expect(state(replacement).roomCode).toBe(roomCode);
    expect(state(replacement).players).toHaveLength(1);
    await expect(original.page.getByRole('alert')).toContainText(/another tab/);
    await expect(
      original.page.getByRole('button', { name: 'Join room', exact: true }),
    ).toBeVisible();
    original.name = 'Fresh player';
    const freshRoom = await createRoom(original);
    expect(freshRoom).not.toBe(roomCode);
    expect(state(original).youId).not.toBe(originalId);
    expect(state(replacement).players).toHaveLength(1);
    for (const player of players) expect(player.errors, player.name).toEqual([]);
  } finally {
    await closePlayers(players);
  }
});
