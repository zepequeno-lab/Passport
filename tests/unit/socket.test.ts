import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachGameServer, type GameServerOptions } from '../../server/socket.js';
import type {
  Ack,
  AckCallback,
  ClientState,
  ClientToServerEvents,
  ServerToClientEvents,
  Session,
} from '../../src/lib/shared/types.js';

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface Client {
  socket: TestSocket;
  snapshots: ClientState[];
  session?: Session;
}

// Unknown payloads are intentional here: the transport must defend its typed API at runtime.
function request(
  client: Client,
  event: keyof ClientToServerEvents,
  payload: unknown,
): Promise<Ack> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`No acknowledgement for ${event}`)), 2_000);
    const emit = client.socket.emit as (
      event: keyof ClientToServerEvents,
      payload: unknown,
      ack: AckCallback,
    ) => TestSocket;
    emit.call(client.socket, event, payload, (response) => {
      clearTimeout(timeout);
      resolve(response);
    });
  });
}

function latest(client: Client): ClientState {
  const state = client.snapshots.at(-1);
  if (!state) throw new Error('The client has not received its room state');
  return state;
}

async function succeed(client: Client, event: keyof ClientToServerEvents, payload: unknown) {
  const response = await request(client, event, payload);
  expect(response).toMatchObject({ ok: true });
  if (response.ok && response.session) client.session = response.session;
  return response;
}

describe('Socket.IO boundary', () => {
  let game: ReturnType<typeof attachGameServer>;
  let url: string;
  let clients: Client[];

  async function startServer(options: GameServerOptions = {}) {
    const server = createServer();
    game = attachGameServer(server, {
      forceFirstCountryId: 'JP',
      random: () => 0,
      roleRevealMs: 30_000,
      discussionMs: 30_000,
      votingMs: 30_000,
      finalGuessMs: 30_000,
      tickMs: 10,
      ...options,
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  beforeEach(async () => {
    clients = [];
    await startServer();
  });

  afterEach(async () => {
    for (const client of clients) client.socket.disconnect();
    await game.close();
  });

  async function connect(): Promise<Client> {
    const socket: TestSocket = io(url, {
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    const client: Client = { socket, snapshots: [] };
    clients.push(client);
    socket.on('room:state', (state) => client.snapshots.push(state));
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return client;
  }

  async function populate(count = 6) {
    const members = await Promise.all(Array.from({ length: count }, connect));
    await succeed(members[0], 'room:create', { displayName: 'Zain' });
    const code = members[0].session?.roomCode;
    const names = [
      'Zain',
      'AAAAAAAAAAAAAAAAAAAA',
      'Very Long Player Name',
      'محمد',
      '日本語',
      'Player-123_ABC',
    ];
    for (let index = 1; index < members.length; index += 1) {
      await succeed(members[index], 'room:join', {
        roomCode: code,
        displayName: names[index] ?? `Traveler ${index}`,
      });
    }
    await expect
      .poll(() => members.every((client) => client.snapshots.at(-1)?.players.length === count))
      .toBe(true);
    return members;
  }

  async function phase(members: Client[], expected: ClientState['phase']) {
    await expect
      .poll(() => members.every((client) => client.snapshots.at(-1)?.phase === expected))
      .toBe(true);
  }

  it('rejects malformed requests with human-readable errors and stays usable', async () => {
    const client = await connect();
    for (const payload of [
      null,
      [],
      'Zain',
      {},
      { displayName: 42 },
      { displayName: 'Zain', host: true },
    ]) {
      const response = await request(client, 'room:create', payload);
      expect(response).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
      if (!response.ok) expect(response.error.length).toBeGreaterThan(10);
    }
    await succeed(client, 'room:create', { displayName: 'Zain' });
    expect(client.session?.roomCode).toMatch(/^[A-Z2-9]{6}$/);
    const malformedVote = await request(client, 'game:vote', {
      roundNumber: '1',
      targetId: 'fake',
    });
    expect(malformedVote).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
    const forgedWin = await request(client, 'game:guess', {
      roundNumber: 1,
      countryId: 'JP',
      winner: 'TOURIST',
    });
    expect(forgedWin).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
  });

  it('rejects Test Mode by default and validates its payload at the socket boundary', async () => {
    const members = await populate(2);
    expect(latest(members[0])).toMatchObject({
      testModeAvailable: false,
      testMode: false,
      minPlayers: 4,
    });
    expect(
      await request(members[0], 'room:test-mode', { roundNumber: 0, enabled: true }),
    ).toMatchObject({
      ok: false,
      code: 'TEST_MODE_UNAVAILABLE',
    });
    for (const payload of [
      { roundNumber: 0, enabled: 'true' },
      { roundNumber: 0, enabled: true, minPlayers: 1 },
      { enabled: true },
    ]) {
      expect(await request(members[0], 'room:test-mode', payload)).toMatchObject({
        ok: false,
        code: 'INVALID_PAYLOAD',
      });
    }
    expect(await request(members[0], 'game:start', { roundNumber: 0 })).toMatchObject({
      ok: false,
      code: 'NOT_ENOUGH_PLAYERS',
    });
  });

  it('plays two development clients through private roles, normal voting, next round, and final guess', async () => {
    await game.close();
    let now = 100_000;
    await startServer({ allowTestMode: true, now: () => now });
    const members = await populate(2);
    expect(
      await request(members[1], 'room:test-mode', { roundNumber: 0, enabled: true }),
    ).toMatchObject({
      ok: false,
      code: 'HOST_ONLY',
    });
    await succeed(members[0], 'room:test-mode', { roundNumber: 0, enabled: true });
    await expect
      .poll(() =>
        members.every((client) => latest(client).testMode && latest(client).minPlayers === 2),
      )
      .toBe(true);
    await succeed(members[0], 'game:start', { roundNumber: 0 });
    await phase(members, 'ROLE_REVEAL');
    const firstTourist = members.find((client) => latest(client).role === 'TOURIST');
    expect(firstTourist).toBeDefined();
    expect(firstTourist && latest(firstTourist)).not.toHaveProperty('country');
    for (const member of members) await succeed(member, 'game:ready', { roundNumber: 1 });
    await phase(members, 'DISCUSSION');
    await succeed(members[0], 'game:start-vote', { roundNumber: 1 });
    await succeed(members[0], 'game:vote', { roundNumber: 1, targetId: latest(members[1]).youId });
    await succeed(members[1], 'game:vote', { roundNumber: 1, targetId: latest(members[0]).youId });
    await phase(members, 'RESULTS');
    expect(latest(members[0]).results?.winner).toBe('TOURIST');
    await succeed(members[0], 'game:next', { roundNumber: 1 });
    await phase(members, 'ROLE_REVEAL');
    const tourist = members.find((client) => latest(client).role === 'TOURIST');
    const traveler = members.find((client) => latest(client).role === 'TRAVELER');
    if (!tourist || !traveler) throw new Error('Both roles must be assigned');
    expect(tourist).not.toBe(firstTourist);
    const country = latest(traveler).country;
    if (!country) throw new Error('The Traveler must receive a country');
    for (const member of members) await succeed(member, 'game:ready', { roundNumber: 2 });
    await succeed(members[0], 'game:start-vote', { roundNumber: 2 });
    await succeed(traveler, 'game:vote', { roundNumber: 2, targetId: latest(tourist).youId });
    now += 30_000;
    await phase(members, 'FINAL_GUESS');
    for (const snapshot of tourist.snapshots.filter((state) => state.roundNumber === 2)) {
      expect(snapshot).not.toHaveProperty('country');
      expect(snapshot).not.toHaveProperty('results');
      expect(JSON.stringify(snapshot)).not.toContain(country.name);
    }
    await succeed(tourist, 'game:guess', { roundNumber: 2, countryId: country.id });
    await phase(members, 'RESULTS');
    expect(latest(tourist).results).toMatchObject({ winner: 'TOURIST', country });
  });

  it('completes a six-client round while omitting the country from every secret Tourist snapshot', async () => {
    const members = await populate();
    const host = members[0];
    await succeed(host, 'game:start', { roundNumber: 0 });
    await phase(members, 'ROLE_REVEAL');
    const tourists = members.filter((client) => latest(client).role === 'TOURIST');
    const travelers = members.filter((client) => latest(client).role === 'TRAVELER');
    expect(tourists).toHaveLength(1);
    expect(travelers).toHaveLength(5);
    for (const traveler of travelers)
      expect(latest(traveler).country).toEqual({ id: 'JP', name: 'Japan' });
    const tourist = tourists[0];
    for (const client of members) await succeed(client, 'game:ready', { roundNumber: 1 });
    await phase(members, 'DISCUSSION');
    await succeed(host, 'game:start-vote', { roundNumber: 1 });
    await phase(members, 'VOTING');
    for (const client of members) {
      await succeed(client, 'game:vote', {
        roundNumber: 1,
        targetId: latest(client === tourist ? travelers[0] : tourist).youId,
      });
    }
    await phase(members, 'FINAL_GUESS');
    for (const snapshot of tourist.snapshots) {
      expect(snapshot).not.toHaveProperty('country');
      expect(snapshot).not.toHaveProperty('results');
      expect(JSON.stringify(snapshot)).not.toContain('Japan');
      expect(JSON.stringify(snapshot)).not.toContain('"JP"');
    }
    expect(
      await request(travelers[0], 'game:guess', { roundNumber: 1, countryId: 'JP' }),
    ).toMatchObject({
      ok: false,
      code: 'TOURIST_ONLY',
    });
    await succeed(tourist, 'game:guess', { roundNumber: 1, countryId: 'JP' });
    await phase(members, 'RESULTS');
    for (const client of members) {
      expect(latest(client).results).toMatchObject({
        country: { id: 'JP', name: 'Japan' },
        touristPlayerId: latest(tourist).youId,
        winner: 'TOURIST',
      });
      expect(latest(client).results?.votes).toHaveLength(6);
    }
    await succeed(host, 'game:next', { roundNumber: 1 });
    await phase(members, 'ROLE_REVEAL');
    expect(latest(host).roundNumber).toBe(2);
    const nextTourist = members.find((client) => latest(client).role === 'TOURIST');
    expect(nextTourist).toBeDefined();
    expect(nextTourist).not.toBe(tourist);
    expect(nextTourist && latest(nextTourist)).not.toHaveProperty('country');
    expect(
      members.find((client) => latest(client).role === 'TRAVELER')?.snapshots.at(-1)?.country?.id,
    ).not.toBe('JP');
  });

  it('rejects unauthorized, stale, and duplicate voting events over the wire', async () => {
    const members = await populate(4);
    expect(await request(members[1], 'game:start', { roundNumber: 0 })).toMatchObject({
      ok: false,
      code: 'HOST_ONLY',
    });
    await succeed(members[0], 'game:start', { roundNumber: 0 });
    for (const client of members) await succeed(client, 'game:ready', { roundNumber: 1 });
    await succeed(members[0], 'game:start-vote', { roundNumber: 1 });
    const targetId = latest(members[1]).youId;
    expect(await request(members[0], 'game:vote', { roundNumber: 0, targetId })).toMatchObject({
      ok: false,
      code: 'STALE_ROUND',
    });
    await succeed(members[0], 'game:vote', { roundNumber: 1, targetId });
    expect(await request(members[0], 'game:vote', { roundNumber: 1, targetId })).toMatchObject({
      ok: false,
      code: 'ALREADY_VOTED',
    });
    await phase(members, 'VOTING');
    expect(latest(members[0])).not.toHaveProperty('votes');
    expect(latest(members[0])).not.toHaveProperty('results');
  });

  it('restores a refreshing host privately and transfers host authority', async () => {
    const members = await populate(4);
    await succeed(members[0], 'game:start', { roundNumber: 0 });
    await phase(members, 'ROLE_REVEAL');
    const session = members[0].session;
    expect(session).toBeDefined();
    members[0].socket.disconnect();
    await expect.poll(() => latest(members[1]).hostPlayerId).toBe(latest(members[1]).youId);
    const restored = await connect();
    await succeed(restored, 'room:resume', session);
    await phase([restored], 'ROLE_REVEAL');
    expect(latest(restored).youId).toBe(session?.playerId);
    expect(latest(restored).role).toBe('TOURIST');
    expect(latest(restored)).not.toHaveProperty('country');
    expect(latest(restored).hostPlayerId).toBe(latest(members[1]).youId);
    expect(latest(restored).players).toHaveLength(4);
  });

  it('rejects an invalid reconnect credential without receiving a room snapshot', async () => {
    const members = await populate(4);
    const impostor = await connect();
    expect(
      await request(impostor, 'room:resume', {
        ...members[0].session,
        token: '0'.repeat(64),
      }),
    ).toMatchObject({ ok: false, code: 'SESSION_EXPIRED' });
    expect(impostor.snapshots).toHaveLength(0);
    expect(latest(members[0]).players).toHaveLength(4);
  });
});
