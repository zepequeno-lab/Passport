import { describe, expect, it, vi } from 'vitest';
import { GameEngine, GameError } from '../../server/engine.js';
import { COUNTRIES } from '../../src/lib/shared/countries.js';
import type { ClientState, Session } from '../../src/lib/shared/types.js';

function room(count = 6, options: ConstructorParameters<typeof GameEngine>[0] = {}) {
  let now = 100_000;
  const engine = new GameEngine({
    now: () => now,
    random: () => 0,
    forceFirstCountryId: 'JP',
    roleRevealMs: 1_000,
    discussionMs: 3_000,
    votingMs: 2_000,
    finalGuessMs: 1_000,
    reconnectGraceMs: 5_000,
    emptyRoomTtlMs: 10_000,
    ...options,
  });
  const connections = Array.from({ length: count }, (_, index) => `connection-${index}`);
  const sessions: Session[] = [];
  const host = connections[0];
  sessions.push(engine.create(host, 'Zain'));
  for (let index = 1; index < count; index += 1) {
    sessions.push(engine.join(connections[index], sessions[0].roomCode, `Player ${index}`));
  }

  function state(connection = host): ClientState {
    const result = engine.getState(connection);
    if (!result) throw new Error(`Missing player state for ${connection}`);
    return result;
  }

  function start() {
    engine.start(host, state().roundNumber);
  }

  function discuss() {
    start();
    for (const connection of connections) engine.ready(connection, state().roundNumber);
  }

  function voting() {
    discuss();
    engine.startVote(host, state().roundNumber);
  }

  function tourist() {
    const connection = connections.find((candidate) => state(candidate).role === 'TOURIST');
    if (!connection) throw new Error('Round has no Tourist');
    return connection;
  }

  function travelers() {
    return connections.filter((connection) => state(connection).role === 'TRAVELER');
  }

  function catchTourist() {
    voting();
    const target = state(tourist()).youId;
    const alternative = state(travelers()[0]).youId;
    for (const connection of connections) {
      engine.vote(connection, state().roundNumber, connection === tourist() ? alternative : target);
    }
  }

  function advance(milliseconds: number) {
    now += milliseconds;
    engine.tick();
  }

  return {
    engine,
    host,
    connections,
    sessions,
    state,
    start,
    discuss,
    voting,
    tourist,
    travelers,
    catchTourist,
    advance,
  };
}

describe('room membership', () => {
  it('creates a room with a valid shareable code and a private reconnect token', () => {
    const game = room(1);
    expect(game.sessions[0].roomCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(game.sessions[0].token.length).toBeGreaterThanOrEqual(24);
    expect(game.state().hostPlayerId).toBe(game.sessions[0].playerId);
    expect(game.state().phase).toBe('LOBBY');
    expect(game.engine.roomCount).toBe(1);
  });

  it('joins a valid room and gives everyone the same membership', () => {
    const game = room(6);
    for (const connection of game.connections) {
      expect(game.state(connection).players).toHaveLength(6);
      expect(game.state(connection).roomCode).toBe(game.sessions[0].roomCode);
    }
    expect(new Set(game.sessions.map((session) => session.playerId)).size).toBe(6);
    expect(new Set(game.sessions.map((session) => session.token)).size).toBe(6);
  });

  it('rejects an invalid room code without creating a room', () => {
    const game = room(1);
    expect(() => game.engine.join('stranger', 'ZZZZZZ', 'Lost traveler')).toThrow(GameError);
    expect(game.engine.getState('stranger')).toBeNull();
    expect(game.engine.roomCount).toBe(1);
  });

  it('rejects duplicate display names regardless of case or surrounding spaces', () => {
    const game = room(1);
    expect(() => game.engine.join('duplicate', game.sessions[0].roomCode, '  zAiN  ')).toThrow(
      GameError,
    );
    expect(game.state().players).toHaveLength(1);
  });

  it('supports ten players and rejects an eleventh', () => {
    const game = room(10);
    expect(() => game.engine.join('extra', game.sessions[0].roomCode, 'Extra')).toThrow(GameError);
    expect(game.state().players).toHaveLength(10);
    game.start();
    expect(game.state().phase).toBe('ROLE_REVEAL');
  });

  it('does not allow a game to start with fewer than four players', () => {
    const game = room(3);
    expect(() => game.start()).toThrow(GameError);
    expect(game.state().phase).toBe('LOBBY');
    expect(game.state().roundNumber).toBe(0);
  });

  it('counts connected players when checking the four-player minimum', () => {
    const game = room(4);
    game.engine.disconnect(game.connections[3]);
    expect(() => game.start()).toThrow(GameError);
    expect(game.state().phase).toBe('LOBBY');
  });

  it('rejects a new player joining an active round', () => {
    const game = room(4);
    game.start();
    expect(() => game.engine.join('latecomer', game.sessions[0].roomCode, 'Latecomer')).toThrow(
      GameError,
    );
    expect(game.state().players).toHaveLength(4);
  });

  it('keeps independent rooms isolated', () => {
    const game = room(4);
    const other = game.engine.create('other-host', 'Zain');
    expect(other.roomCode).not.toBe(game.sessions[0].roomCode);
    game.start();
    expect(game.engine.getState('other-host')?.phase).toBe('LOBBY');
    expect(game.engine.getState('other-host')?.players).toHaveLength(1);
    expect(game.engine.roomCount).toBe(2);
  });
});

describe('development Test Mode', () => {
  it('keeps the four-player minimum when development support has not been enabled', () => {
    const game = room(2);
    expect(game.state()).toMatchObject({
      testModeAvailable: false,
      testMode: false,
      minPlayers: 4,
    });
    expect(() => game.engine.setTestMode(game.host, 0, true)).toThrow(GameError);
    expect(() => game.start()).toThrow(GameError);
    expect(game.state().phase).toBe('LOBBY');
  });

  it('rejects Test Mode in production even if an option accidentally enables it', () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const game = room(2, { allowTestMode: true });
      expect(game.state()).toMatchObject({
        testModeAvailable: false,
        testMode: false,
        minPlayers: 4,
      });
      expect(() => game.engine.setTestMode(game.host, 0, true)).toThrow(GameError);
      expect(() => game.start()).toThrow(GameError);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('requires explicit host opt-in before two connected players can start', () => {
    const game = room(2, { allowTestMode: true });
    expect(game.state()).toMatchObject({ testModeAvailable: true, testMode: false, minPlayers: 4 });
    expect(() => game.start()).toThrow(GameError);
    expect(() => game.engine.setTestMode(game.connections[1], 0, true)).toThrow(GameError);
    game.engine.setTestMode(game.host, 0, true);
    for (const connection of game.connections) {
      expect(game.state(connection)).toMatchObject({ testMode: true, minPlayers: 2 });
    }
    game.start();
    expect(game.state().phase).toBe('ROLE_REVEAL');
    expect(game.travelers()).toHaveLength(1);
    expect(game.state(game.tourist())).not.toHaveProperty('country');
  });

  it('still requires two connected players and preserves the ten-player limit', () => {
    const alone = room(1, { allowTestMode: true });
    alone.engine.setTestMode(alone.host, 0, true);
    expect(() => alone.start()).toThrow(GameError);
    const disconnected = room(2, { allowTestMode: true });
    disconnected.engine.setTestMode(disconnected.host, 0, true);
    disconnected.engine.disconnect(disconnected.connections[1]);
    expect(() => disconnected.start()).toThrow(GameError);
    const full = room(10, { allowTestMode: true });
    full.engine.setTestMode(full.host, 0, true);
    expect(() => full.engine.join('eleventh', full.sessions[0].roomCode, 'Extra')).toThrow(
      GameError,
    );
    full.start();
    expect(full.state().players).toHaveLength(10);
  });

  it('rejects stale toggle requests and mode changes during a round', () => {
    const game = room(2, { allowTestMode: true });
    expect(() => game.engine.setTestMode(game.host, 1, true)).toThrow(GameError);
    expect(game.state().testMode).toBe(false);
    game.engine.setTestMode(game.host, 0, true);
    game.discuss();
    expect(() => game.engine.setTestMode(game.host, 1, false)).toThrow(GameError);
    expect(game.state()).toMatchObject({ phase: 'DISCUSSION', testMode: true, minPlayers: 2 });
  });

  it('retains normal two-player tie rules and starts another private round', () => {
    const game = room(2, { allowTestMode: true });
    game.engine.setTestMode(game.host, 0, true);
    game.voting();
    const firstTourist = game.tourist();
    expect(() => game.engine.vote(game.host, 1, game.state().youId)).toThrow(GameError);
    game.engine.vote(game.connections[0], 1, game.sessions[1].playerId);
    game.engine.vote(game.connections[1], 1, game.sessions[0].playerId);
    expect(game.state()).toMatchObject({ phase: 'RESULTS', testMode: true, minPlayers: 2 });
    expect(game.state().results).toMatchObject({ winner: 'TOURIST', touristGuess: null });
    expect(game.state().results?.votes).toHaveLength(2);
    game.engine.next(game.host, 1);
    expect(game.state()).toMatchObject({ phase: 'ROLE_REVEAL', roundNumber: 2, testMode: true });
    expect(game.tourist()).not.toBe(firstTourist);
    expect(game.state(game.tourist())).not.toHaveProperty('country');
    expect(game.state(game.travelers()[0]).country?.id).not.toBe('JP');
    expect(game.state()).not.toHaveProperty('results');
  });

  it.each([
    ['JP', 'TOURIST'],
    ['KR', 'TRAVELERS'],
  ] as const)(
    'resolves a two-player final guess of %s while keeping the selected country private',
    (guess, winner) => {
      const game = room(2, { allowTestMode: true });
      game.engine.setTestMode(game.host, 0, true);
      game.start();
      const tourist = game.tourist();
      const traveler = game.travelers()[0];
      const assertPrivate = () => {
        expect(game.state(tourist)).not.toHaveProperty('country');
        expect(game.state(tourist)).not.toHaveProperty('results');
        expect(JSON.stringify(game.state(tourist))).not.toContain('Japan');
      };
      assertPrivate();
      for (const connection of game.connections) game.engine.ready(connection, 1);
      expect(game.state().phase).toBe('DISCUSSION');
      assertPrivate();
      game.engine.startVote(game.host, 1);
      game.engine.vote(traveler, 1, game.state(tourist).youId);
      expect(game.state().phase).toBe('VOTING');
      assertPrivate();
      game.advance(2_000);
      expect(game.state().phase).toBe('FINAL_GUESS');
      assertPrivate();
      game.engine.guess(tourist, 1, guess);
      expect(game.state().results).toMatchObject({ country: { id: 'JP', name: 'Japan' }, winner });
    },
  );

  it('lets the host restore the normal minimum between rounds', () => {
    const game = room(2, { allowTestMode: true });
    game.engine.setTestMode(game.host, 0, true);
    game.voting();
    game.advance(2_000);
    expect(() => game.engine.setTestMode(game.connections[1], 1, false)).toThrow(GameError);
    game.engine.setTestMode(game.host, 1, false);
    expect(game.state()).toMatchObject({ phase: 'RESULTS', testMode: false, minPlayers: 4 });
    expect(() => game.engine.next(game.host, 1)).toThrow(GameError);
    game.engine.join('third', game.sessions[0].roomCode, 'Third');
    game.engine.join('fourth', game.sessions[0].roomCode, 'Fourth');
    game.engine.next(game.host, 1);
    expect(game.state()).toMatchObject({ phase: 'ROLE_REVEAL', roundNumber: 2, minPlayers: 4 });
  });

  it('keeps Test Mode room-local and restores its state after a private reconnect', () => {
    const game = room(2, { allowTestMode: true });
    game.engine.setTestMode(game.host, 0, true);
    game.engine.create('other-host', 'Other room');
    expect(game.engine.getState('other-host')).toMatchObject({ testMode: false, minPlayers: 4 });
    game.start();
    game.engine.disconnect(game.host);
    game.engine.resume('reconnected-host', game.sessions[0]);
    const restored = game.engine.getState('reconnected-host');
    expect(restored).toMatchObject({ testMode: true, minPlayers: 2, role: 'TOURIST' });
    expect(restored).not.toHaveProperty('country');
    expect(restored?.hostPlayerId).toBe(game.sessions[1].playerId);
  });
});

describe('secret assignment and transitions', () => {
  it('chooses exactly one Tourist among six players', () => {
    const game = room();
    game.start();
    expect(
      game.connections.filter((connection) => game.state(connection).role === 'TOURIST'),
    ).toHaveLength(1);
    expect(game.travelers()).toHaveLength(5);
  });

  it('sends the same selected country privately to every Traveler', () => {
    const game = room();
    game.start();
    for (const connection of game.travelers()) {
      expect(game.state(connection).country).toEqual({ id: 'JP', name: 'Japan' });
    }
  });

  it('omits the selected country and other private data from Tourist payloads in every secret phase', () => {
    const game = room();
    game.start();
    const tourist = game.tourist();
    const assertPrivate = () => {
      const state = game.state(tourist);
      expect(state).not.toHaveProperty('country');
      expect(state).not.toHaveProperty('results');
      expect(state).not.toHaveProperty('touristPlayerId');
      const serialized = JSON.stringify(state);
      expect(serialized).not.toContain('Japan');
      expect(serialized).not.toContain('"JP"');
      for (const session of game.sessions) expect(serialized).not.toContain(session.token);
    };
    assertPrivate();
    for (const connection of game.connections) game.engine.ready(connection, 1);
    assertPrivate();
    game.engine.startVote(game.host, 1);
    assertPrivate();
    for (const connection of game.connections) {
      const target =
        connection === tourist ? game.state(game.travelers()[0]).youId : game.state(tourist).youId;
      game.engine.vote(connection, 1, target);
    }
    expect(game.state(tourist).phase).toBe('FINAL_GUESS');
    assertPrivate();
  });

  it('keeps role identities and vote choices out of public player data', () => {
    const game = room();
    game.voting();
    game.engine.vote(game.connections[1], 1, game.state(game.connections[2]).youId);
    for (const connection of game.connections) {
      const snapshot = game.state(connection);
      expect(snapshot).not.toHaveProperty('votes');
      expect(snapshot).not.toHaveProperty('touristPlayerId');
      for (const player of snapshot.players) {
        expect(player).not.toHaveProperty('role');
        expect(player).not.toHaveProperty('token');
        expect(player).not.toHaveProperty('targetId');
      }
    }
  });

  it('allows only the host to start a game', () => {
    const game = room(4);
    expect(() => game.engine.start(game.connections[1], 0)).toThrow(GameError);
    expect(game.state().phase).toBe('LOBBY');
  });

  it('waits for everyone to be ready, then starts discussion automatically', () => {
    const game = room(4);
    game.start();
    for (const connection of game.connections.slice(0, -1)) game.engine.ready(connection, 1);
    expect(game.state().phase).toBe('ROLE_REVEAL');
    game.engine.ready(game.connections[3], 1);
    expect(game.state().phase).toBe('DISCUSSION');
    expect(game.state().deadline).toBe(game.state().serverNow + 3_000);
  });

  it('uses a server deadline to advance past an AFK role reveal', () => {
    const game = room(4);
    game.start();
    game.advance(999);
    expect(game.state().phase).toBe('ROLE_REVEAL');
    game.advance(1);
    expect(game.state().phase).toBe('DISCUSSION');
  });

  it('automatically starts voting when the discussion deadline expires', () => {
    const game = room(4);
    game.discuss();
    game.advance(3_000);
    expect(game.state().phase).toBe('VOTING');
  });

  it('allows only the host to start voting early', () => {
    const game = room(4);
    game.discuss();
    expect(() => game.engine.startVote(game.connections[1], 1)).toThrow(GameError);
    expect(game.state().phase).toBe('DISCUSSION');
    game.engine.startVote(game.host, 1);
    expect(game.state().phase).toBe('VOTING');
  });

  it('rejects actions from the wrong phase without changing the round', () => {
    const game = room(4);
    expect(() => game.engine.ready(game.host, 0)).toThrow(GameError);
    expect(() => game.engine.startVote(game.host, 0)).toThrow(GameError);
    expect(() => game.engine.vote(game.host, 0, game.sessions[1].playerId)).toThrow(GameError);
    expect(() => game.engine.guess(game.host, 0, 'JP')).toThrow(GameError);
    expect(() => game.engine.next(game.host, 0)).toThrow(GameError);
    expect(game.state().phase).toBe('LOBBY');
    expect(game.state().roundNumber).toBe(0);
  });
});

describe('server-authoritative voting and final guesses', () => {
  it('forbids self-votes and votes for unknown players', () => {
    const game = room(4);
    game.voting();
    expect(() => game.engine.vote(game.host, 1, game.state().youId)).toThrow(GameError);
    expect(() => game.engine.vote(game.host, 1, 'invented-player')).toThrow(GameError);
    expect(game.state().players.find((player) => player.id === game.state().youId)?.hasVoted).toBe(
      false,
    );
  });

  it('keeps a submitted vote locked when duplicate or changed submissions arrive', () => {
    const game = room(4);
    game.voting();
    const voter = game.connections[1];
    const target = game.state(game.tourist()).youId;
    game.engine.vote(voter, 1, target);
    expect(() => game.engine.vote(voter, 1, target)).toThrow(GameError);
    expect(() => game.engine.vote(voter, 1, game.state(game.connections[2]).youId)).toThrow(
      GameError,
    );
    expect(game.state().phase).toBe('VOTING');
    for (const connection of game.connections.filter((candidate) => candidate !== voter)) {
      game.engine.vote(
        connection,
        1,
        connection === game.tourist() ? game.state(voter).youId : target,
      );
    }
    expect(game.state().phase).toBe('FINAL_GUESS');
    game.engine.guess(game.tourist(), 1, 'JP');
    expect(
      game.state().results?.votes.filter((vote) => vote.voterId === game.state(voter).youId),
    ).toEqual([{ voterId: game.state(voter).youId, targetId: target }]);
  });

  it('rejects stale votes without counting them', () => {
    const game = room(4);
    game.voting();
    expect(() => game.engine.vote(game.host, 0, game.sessions[1].playerId)).toThrow(GameError);
    expect(game.state().players.every((player) => !player.hasVoted)).toBe(true);
  });

  it('enters FINAL_GUESS when the Tourist alone has the most votes', () => {
    const game = room();
    game.catchTourist();
    for (const connection of game.connections)
      expect(game.state(connection).phase).toBe('FINAL_GUESS');
    expect(game.state(game.tourist())).not.toHaveProperty('country');
    expect(game.state()).not.toHaveProperty('results');
  });

  it('gives the Tourist the win if another player receives the most votes', () => {
    const game = room(4);
    game.voting();
    const target = game.travelers()[0];
    for (const connection of game.connections) {
      game.engine.vote(
        connection,
        1,
        game.state(connection === target ? game.travelers()[1] : target).youId,
      );
    }
    expect(game.state().phase).toBe('RESULTS');
    expect(game.state().results?.winner).toBe('TOURIST');
    expect(game.state().results?.touristGuess).toBeNull();
  });

  it('lets the Tourist survive a tie for the highest vote count', () => {
    const game = room(4);
    game.voting();
    const tourist = game.tourist();
    const travelers = game.travelers();
    game.engine.vote(tourist, 1, game.state(travelers[0]).youId);
    game.engine.vote(travelers[0], 1, game.state(tourist).youId);
    game.engine.vote(travelers[1], 1, game.state(tourist).youId);
    game.engine.vote(travelers[2], 1, game.state(travelers[0]).youId);
    expect(game.state().phase).toBe('RESULTS');
    expect(game.state().results?.winner).toBe('TOURIST');
  });

  it('resolves an empty ballot at the deadline as a Tourist survival', () => {
    const game = room(4);
    game.voting();
    game.advance(2_000);
    expect(game.state().phase).toBe('RESULTS');
    expect(game.state().results?.winner).toBe('TOURIST');
    expect(game.state().results?.votes).toEqual([]);
  });

  it('resolves the votes submitted before the voting deadline', () => {
    const game = room(4);
    game.voting();
    game.engine.vote(game.travelers()[0], 1, game.state(game.tourist()).youId);
    game.advance(2_000);
    expect(game.state().phase).toBe('FINAL_GUESS');
  });

  it('allows only the Tourist to submit a final guess', () => {
    const game = room(4);
    game.catchTourist();
    expect(() => game.engine.guess(game.travelers()[0], 1, 'JP')).toThrow(GameError);
    expect(game.state().phase).toBe('FINAL_GUESS');
  });

  it('rejects countries outside the curated pool without consuming the final guess', () => {
    const game = room(4);
    game.catchTourist();
    expect(() => game.engine.guess(game.tourist(), 1, 'ATLANTIS')).toThrow(GameError);
    expect(game.state().phase).toBe('FINAL_GUESS');
    game.engine.guess(game.tourist(), 1, 'JP');
    expect(game.state().results?.winner).toBe('TOURIST');
  });

  it('awards the Tourist a stolen win for the correct final guess', () => {
    const game = room();
    game.catchTourist();
    const touristId = game.state(game.tourist()).youId;
    game.engine.guess(game.tourist(), 1, 'JP');
    expect(game.state().phase).toBe('RESULTS');
    expect(game.state().results).toMatchObject({
      country: { id: 'JP', name: 'Japan' },
      touristPlayerId: touristId,
      touristGuess: { id: 'JP', name: 'Japan' },
      winner: 'TOURIST',
    });
    expect(game.state().results?.votes).toHaveLength(6);
  });

  it('awards Travelers the win for an incorrect final guess', () => {
    const game = room(4);
    game.catchTourist();
    game.engine.guess(game.tourist(), 1, 'KR');
    expect(game.state().phase).toBe('RESULTS');
    expect(game.state().results).toMatchObject({
      country: { id: 'JP', name: 'Japan' },
      touristGuess: { id: 'KR', name: 'South Korea' },
      winner: 'TRAVELERS',
    });
  });

  it('awards Travelers the win when the Tourist misses the final-guess deadline', () => {
    const game = room(4);
    game.catchTourist();
    game.advance(1_000);
    expect(game.state().phase).toBe('RESULTS');
    expect(game.state().results?.winner).toBe('TRAVELERS');
    expect(game.state().results?.touristGuess).toBeNull();
  });

  it('does not let a duplicate final guess replace the original result', () => {
    const game = room(4);
    game.catchTourist();
    const tourist = game.tourist();
    game.engine.guess(tourist, 1, 'KR');
    expect(() => game.engine.guess(tourist, 1, 'JP')).toThrow(GameError);
    expect(game.state().results?.winner).toBe('TRAVELERS');
    expect(game.state().results?.touristGuess?.id).toBe('KR');
  });
});

describe('next round', () => {
  it('retains the room and players while clearing votes, guesses, readiness, and results', () => {
    const game = room(4);
    game.catchTourist();
    game.engine.guess(game.tourist(), 1, 'JP');
    const previousPlayers = game.state().players.map((player) => player.id);
    const previousCode = game.state().roomCode;
    game.engine.next(game.host, 1);
    expect(game.state().phase).toBe('ROLE_REVEAL');
    expect(game.state().roomCode).toBe(previousCode);
    expect(game.state().players.map((player) => player.id)).toEqual(previousPlayers);
    expect(game.state().players.every((player) => !player.ready && !player.hasVoted)).toBe(true);
    for (const connection of game.connections)
      expect(game.state(connection)).not.toHaveProperty('results');
  });

  it('increments the round number and chooses a different country and Tourist', () => {
    const game = room(4);
    game.catchTourist();
    const oldTourist = game.tourist();
    game.engine.guess(oldTourist, 1, 'JP');
    game.engine.next(game.host, 1);
    expect(game.state().roundNumber).toBe(2);
    expect(game.tourist()).not.toBe(oldTourist);
    expect(game.state(game.travelers()[0]).country?.id).not.toBe('JP');
    expect(COUNTRIES.map((country) => country.id)).toContain(
      game.state(game.travelers()[0]).country?.id,
    );
  });

  it('rejects non-host next-round requests', () => {
    const game = room(4);
    game.catchTourist();
    game.engine.guess(game.tourist(), 1, 'JP');
    expect(() => game.engine.next(game.connections[1], 1)).toThrow(GameError);
    expect(game.state().phase).toBe('RESULTS');
    expect(game.state().roundNumber).toBe(1);
  });

  it('rejects old-round actions after the next round has started', () => {
    const game = room(4);
    game.catchTourist();
    game.engine.guess(game.tourist(), 1, 'JP');
    game.engine.next(game.host, 1);
    expect(() => game.engine.ready(game.host, 1)).toThrow(GameError);
    expect(() => game.engine.next(game.host, 1)).toThrow(GameError);
    for (const connection of game.connections) game.engine.ready(connection, 2);
    game.engine.startVote(game.host, 2);
    expect(() => game.engine.vote(game.host, 1, game.sessions[1].playerId)).toThrow(GameError);
    expect(game.state().players.every((player) => !player.hasVoted)).toBe(true);
    expect(game.state().roundNumber).toBe(2);
  });

  it('records one round summary with the resolved outcome', () => {
    const onSummary = vi.fn();
    const game = room(4, { onSummary });
    game.catchTourist();
    game.engine.guess(game.tourist(), 1, 'KR');
    expect(onSummary).toHaveBeenCalledTimes(1);
    game.advance(30_000);
    expect(onSummary).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(onSummary.mock.calls[0][0]);
    expect(serialized).toContain('Japan');
    expect(serialized).toContain('TRAVELERS');
    for (const session of game.sessions) expect(serialized).not.toContain(session.token);
  });
});

describe('disconnects, reconnects, and room cleanup', () => {
  it('frees departed result-screen seats so a replacement can join and the next round can start', () => {
    const game = room(10);
    game.catchTourist();
    game.engine.guess(game.tourist(), 1, 'JP');
    for (const connection of game.connections.slice(3)) game.engine.leave(connection);
    expect(game.state().players).toHaveLength(3);
    expect(() => game.engine.next(game.host, 1)).toThrow(GameError);
    const replacement = game.engine.join(
      'replacement-player',
      game.sessions[0].roomCode,
      'Replacement',
    );
    expect(game.state().players).toHaveLength(4);
    expect(game.state().players.some((player) => player.id === replacement.playerId)).toBe(true);
    game.engine.next(game.host, 1);
    expect(game.state().phase).toBe('ROLE_REVEAL');
    expect(game.state().roundNumber).toBe(2);
    expect(game.engine.getState('replacement-player')?.role).not.toBeNull();
  });

  it('preserves historical names and votes after participants leave the result screen', () => {
    const game = room(10);
    game.catchTourist();
    game.engine.guess(game.tourist(), 1, 'JP');
    const originalResults = game.state().results;
    expect(originalResults?.roster).toHaveLength(10);
    for (const connection of game.connections.slice(3)) game.engine.leave(connection);
    game.engine.join('replacement-player', game.sessions[0].roomCode, 'Replacement');
    const currentResults = game.state().results;
    expect(currentResults).toEqual(originalResults);
    expect(currentResults?.roster.some((player) => player.displayName === 'Replacement')).toBe(
      false,
    );
    const historicalIds = new Set(currentResults?.roster.map((player) => player.id));
    for (const vote of currentResults?.votes ?? []) {
      expect(historicalIds.has(vote.voterId)).toBe(true);
      expect(historicalIds.has(vote.targetId)).toBe(true);
    }
    expect(historicalIds.has(currentResults?.touristPlayerId ?? '')).toBe(true);
  });

  it('includes departed active-round participants in the reveal while freeing their live seats', () => {
    const game = room(6);
    game.discuss();
    const tourist = game.tourist();
    const travelers = game.travelers();
    const touristId = game.state(tourist).youId;
    const departedId = game.state(travelers[0]).youId;
    const observer = travelers[1];
    game.engine.leave(travelers[0]);
    game.engine.leave(tourist);
    const revealed = game.state(observer);
    expect(revealed.phase).toBe('RESULTS');
    expect(revealed.players).toHaveLength(4);
    expect(
      revealed.players.some((player) => player.id === departedId || player.id === touristId),
    ).toBe(false);
    expect(revealed.results?.roster).toHaveLength(6);
    expect(revealed.results?.roster.find((player) => player.id === touristId)?.displayName).toBe(
      'Zain',
    );
    expect(revealed.results?.roster.find((player) => player.id === departedId)?.displayName).toBe(
      'Player 1',
    );
  });

  it('returns independent result-roster snapshots that cannot mutate stored history', () => {
    const game = room(4);
    game.catchTourist();
    game.engine.guess(game.tourist(), 1, 'JP');
    const first = game.state().results;
    if (!first) throw new Error('The completed round has no results');
    const original = first.roster.map((player) => ({ ...player }));
    first.roster[0].displayName = 'Tampered';
    first.roster.splice(1);
    expect(game.state().results?.roster).toEqual(original);
    expect(game.state(game.connections[1]).results?.roster).toEqual(original);
  });

  it('reclaims disconnected result-screen seats after grace while preserving reveal history', () => {
    const game = room(10);
    game.catchTourist();
    game.engine.guess(game.tourist(), 1, 'JP');
    const disconnectedId = game.sessions[9].playerId;
    const historicalRoster = game.state().results?.roster;
    game.engine.disconnect(game.connections[9]);
    expect(() =>
      game.engine.join('replacement-player', game.sessions[0].roomCode, 'Replacement'),
    ).toThrow(GameError);
    game.advance(4_999);
    expect(game.state().players).toHaveLength(10);
    game.advance(1);
    expect(game.state().players).toHaveLength(9);
    expect(game.state().players.some((player) => player.id === disconnectedId)).toBe(false);
    game.engine.join('replacement-player', game.sessions[0].roomCode, 'Replacement');
    expect(game.state().players).toHaveLength(10);
    expect(game.state().results?.roster).toEqual(historicalRoster);
    expect(() => game.engine.resume('expired-player', game.sessions[9])).toThrow(GameError);
  });

  it('allows voting for a temporarily disconnected Tourist so disconnecting cannot dodge the ballot', () => {
    const game = room(4);
    game.voting();
    const tourist = game.tourist();
    const targetId = game.state(tourist).youId;
    const travelers = game.travelers();
    game.engine.disconnect(tourist);
    expect(game.state(travelers[0]).players.find((player) => player.id === targetId)).toMatchObject(
      {
        connected: false,
        active: true,
      },
    );
    for (const traveler of travelers) game.engine.vote(traveler, 1, targetId);
    expect(game.state(travelers[0]).phase).toBe('FINAL_GUESS');
    game.advance(1_000);
    expect(game.state(travelers[0]).results?.winner).toBe('TRAVELERS');
  });

  it('does not accept votes for a Traveler who explicitly left the round', () => {
    const game = room(4);
    game.voting();
    const traveler = game.travelers()[0];
    const targetId = game.state(traveler).youId;
    game.engine.leave(traveler);
    expect(game.state().players.find((player) => player.id === targetId)).toMatchObject({
      connected: false,
      active: false,
    });
    expect(() => game.engine.vote(game.host, 1, targetId)).toThrow(GameError);
    expect(game.state().phase).toBe('VOTING');
  });

  it('migrates the host to a connected player when the host disconnects', () => {
    const game = room(4);
    const formerHost = game.state().hostPlayerId;
    game.engine.disconnect(game.host);
    const snapshot = game.state(game.connections[1]);
    expect(snapshot.hostPlayerId).not.toBe(formerHost);
    expect(snapshot.players.find((player) => player.id === snapshot.hostPlayerId)?.connected).toBe(
      true,
    );
    expect(snapshot.players.find((player) => player.id === formerHost)?.connected).toBe(false);
  });

  it('migrates the host and removes a player who explicitly leaves the lobby', () => {
    const game = room(4);
    game.engine.leave(game.host);
    const snapshot = game.state(game.connections[1]);
    expect(snapshot.hostPlayerId).not.toBe(game.sessions[0].playerId);
    expect(snapshot.players).toHaveLength(3);
    expect(game.engine.getState(game.host)).toBeNull();
  });

  it('keeps discussion running when a Traveler disconnects', () => {
    const game = room();
    game.discuss();
    const traveler = game.travelers()[0];
    game.engine.disconnect(traveler);
    expect(game.state().phase).toBe('DISCUSSION');
    expect(
      game
        .state()
        .players.find(
          (player) => player.id === game.sessions[game.connections.indexOf(traveler)].playerId,
        )?.connected,
    ).toBe(false);
  });

  it('resolves voting once all remaining connected players have voted', () => {
    const game = room();
    game.voting();
    const disconnected = game.travelers()[0];
    for (const connection of game.connections.filter((candidate) => candidate !== disconnected)) {
      const target =
        connection === game.tourist()
          ? game.state(game.travelers()[1]).youId
          : game.state(game.tourist()).youId;
      game.engine.vote(connection, 1, target);
    }
    expect(game.state().phase).toBe('VOTING');
    game.engine.disconnect(disconnected);
    expect(game.state().phase).toBe('FINAL_GUESS');
  });

  it('ends the round with a Travelers win when the Tourist explicitly leaves', () => {
    const game = room();
    game.discuss();
    const tourist = game.tourist();
    const observer = game.travelers()[0];
    game.engine.leave(tourist);
    expect(game.state(observer).phase).toBe('RESULTS');
    expect(game.state(observer).results?.winner).toBe('TRAVELERS');
  });

  it('gives a disconnected Tourist a grace period before ending the round', () => {
    const game = room(4, { discussionMs: 30_000 });
    game.discuss();
    const tourist = game.tourist();
    const observer = game.travelers()[0];
    game.engine.disconnect(tourist);
    game.advance(4_999);
    expect(game.state(observer).phase).toBe('DISCUSSION');
    game.advance(1);
    expect(game.state(observer).phase).toBe('RESULTS');
    expect(game.state(observer).results?.winner).toBe('TRAVELERS');
  });

  it('restores the same private role after a Tourist refresh', () => {
    const game = room(4);
    game.start();
    const tourist = game.tourist();
    const session = game.sessions[game.connections.indexOf(tourist)];
    game.engine.disconnect(tourist);
    game.engine.resume('refreshed-tourist', session);
    const restored = game.engine.getState('refreshed-tourist');
    expect(restored?.youId).toBe(session.playerId);
    expect(restored?.role).toBe('TOURIST');
    expect(restored?.phase).toBe('ROLE_REVEAL');
    expect(restored).not.toHaveProperty('country');
    expect(restored?.players).toHaveLength(4);
  });

  it('restores a Traveler and selected country after refresh during discussion', () => {
    const game = room(4);
    game.discuss();
    const traveler = game.travelers()[0];
    const session = game.sessions[game.connections.indexOf(traveler)];
    game.engine.disconnect(traveler);
    game.engine.resume('refreshed-traveler', session);
    expect(game.engine.getState('refreshed-traveler')).toMatchObject({
      youId: session.playerId,
      role: 'TRAVELER',
      country: { id: 'JP', name: 'Japan' },
      phase: 'DISCUSSION',
    });
  });

  it('rejects forged reconnect tokens without changing the original player session', () => {
    const game = room(4);
    expect(() =>
      game.engine.resume('impostor', { ...game.sessions[0], token: 'incorrect-token' }),
    ).toThrow(GameError);
    expect(game.engine.getState('impostor')).toBeNull();
    expect(game.state().youId).toBe(game.sessions[0].playerId);
  });

  it('invalidates the old connection when the same valid session reconnects', () => {
    const game = room(4);
    const resumed = game.engine.resume('replacement', game.sessions[0]);
    expect(resumed.replacedConnectionId).toBe(game.host);
    expect(game.engine.getState(game.host)).toBeNull();
    expect(() => game.engine.start(game.host, 0)).toThrow(GameError);
    game.engine.start('replacement', 0);
    expect(game.engine.getState('replacement')?.phase).toBe('ROLE_REVEAL');
  });

  it('does not disconnect the replacement session when the old socket closes', () => {
    const game = room(4);
    game.engine.resume('replacement', game.sessions[0]);
    game.engine.disconnect(game.host);
    const restored = game.engine.getState('replacement');
    expect(restored?.players.find((player) => player.id === restored.youId)?.connected).toBe(true);
  });

  it('restores a submitted vote after reconnection without allowing another vote', () => {
    const game = room();
    game.voting();
    const traveler = game.travelers()[0];
    const session = game.sessions[game.connections.indexOf(traveler)];
    game.engine.vote(traveler, 1, game.state(game.tourist()).youId);
    game.engine.disconnect(traveler);
    game.engine.resume('reconnected-voter', session);
    const restored = game.engine.getState('reconnected-voter');
    expect(restored?.players.find((player) => player.id === session.playerId)?.hasVoted).toBe(true);
    expect(() => game.engine.vote('reconnected-voter', 1, game.sessions[0].playerId)).toThrow(
      GameError,
    );
  });

  it('cleans up a room after all disconnected players exceed its retention deadline', () => {
    const game = room(4);
    for (const connection of game.connections) game.engine.disconnect(connection);
    game.advance(10_001);
    expect(game.engine.roomCount).toBe(0);
    expect(() => game.engine.resume('too-late', game.sessions[0])).toThrow(GameError);
  });

  it('cleans up a room after every player explicitly leaves', () => {
    const game = room(4);
    for (const connection of game.connections) game.engine.leave(connection);
    game.advance(10_001);
    expect(game.engine.roomCount).toBe(0);
  });
});
