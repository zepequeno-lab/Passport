import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { COUNTRIES } from '../src/lib/shared/countries.js';
import type { ClientState, Country, Phase, Session, Winner } from '../src/lib/shared/types.js';
import {
  activeRound,
  connectedParticipants,
  connectedPlayers,
  type Player,
  type Room,
} from './room.js';

export class GameError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GameError';
  }
}

export interface RoundSummary {
  roomCode: string;
  roundNumber: number;
  playerCount: number;
  country: string;
  tourist: string;
  voteDistribution: Record<string, number>;
  touristGuess: string | null;
  winner: Winner;
  durationMs: number;
}

export interface EngineOptions {
  /** Explicit development-server opt-in. Production environments always reject Test Mode. */
  allowTestMode?: boolean;
  now?: () => number;
  random?: () => number;
  roleRevealMs?: number;
  discussionMs?: number;
  votingMs?: number;
  finalGuessMs?: number;
  reconnectGraceMs?: number;
  emptyRoomTtlMs?: number;
  forceFirstCountryId?: string;
  onSummary?: (summary: RoundSummary) => void;
}

interface Binding {
  roomCode: string;
  playerId: string;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MIN_PLAYERS = 4;
const TEST_MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;

/** Pure in-memory authority: transport only validates payload shapes and distributes snapshots. */
export class GameEngine {
  private readonly rooms = new Map<string, Room>();
  private readonly bindings = new Map<string, Binding>();
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly durations: Record<
    'ROLE_REVEAL' | 'DISCUSSION' | 'VOTING' | 'FINAL_GUESS',
    number
  >;
  private readonly reconnectGraceMs: number;
  private readonly emptyRoomTtlMs: number;
  private readonly testModeAvailable: boolean;
  public revision = 0;

  constructor(private readonly options: EngineOptions = {}) {
    this.testModeAvailable =
      options.allowTestMode === true && process.env.NODE_ENV !== 'production';
    this.now = options.now ?? Date.now;
    this.random = options.random ?? (() => randomInt(0, 0x100000000) / 0x100000000);
    this.durations = {
      ROLE_REVEAL: options.roleRevealMs ?? 30_000,
      DISCUSSION: options.discussionMs ?? 180_000,
      VOTING: options.votingMs ?? 30_000,
      FINAL_GUESS: options.finalGuessMs ?? 30_000,
    };
    this.reconnectGraceMs = options.reconnectGraceMs ?? 45_000;
    this.emptyRoomTtlMs = options.emptyRoomTtlMs ?? 5 * 60_000;
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  create(connectionId: string, displayName: string): Session {
    this.requireUnbound(connectionId);
    const name = this.cleanName(displayName);
    let code: string;
    do {
      code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join(
        '',
      );
    } while (this.rooms.has(code));
    const player = this.newPlayer(connectionId, name);
    const room: Room = {
      code,
      hostPlayerId: player.id,
      players: new Map([[player.id, player]]),
      phase: 'LOBBY',
      roundNumber: 0,
      testMode: false,
      participantIds: new Set(),
      country: null,
      touristPlayerId: null,
      previousCountryId: null,
      previousTouristId: null,
      votes: new Map(),
      touristGuess: null,
      results: null,
      deadline: null,
      startedAt: null,
      emptySince: null,
    };
    this.rooms.set(code, room);
    this.bindings.set(connectionId, { roomCode: code, playerId: player.id });
    this.changed();
    return this.session(room, player);
  }

  join(connectionId: string, roomCode: string, displayName: string): Session {
    this.tick();
    this.requireUnbound(connectionId);
    const room = this.rooms.get(this.cleanCode(roomCode));
    if (!room)
      throw new GameError(
        'ROOM_NOT_FOUND',
        'That room was not found. Check the code and try again.',
      );
    if (activeRound(room))
      throw new GameError(
        'ROUND_IN_PROGRESS',
        'This round has started. Join when the results appear.',
      );
    const name = this.cleanName(displayName);
    if (room.players.size >= MAX_PLAYERS)
      throw new GameError('ROOM_FULL', 'This room is full. A room holds up to 10 players.');
    if (
      [...room.players.values()].some(
        (player) => player.displayName.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    ) {
      throw new GameError(
        'NAME_TAKEN',
        'That name is already in use in this room. Choose another.',
      );
    }
    const player = this.newPlayer(connectionId, name);
    room.players.set(player.id, player);
    room.emptySince = null;
    this.bindings.set(connectionId, { roomCode: room.code, playerId: player.id });
    this.migrateHost(room);
    this.changed();
    return this.session(room, player);
  }

  resume(connectionId: string, session: Session): { replacedConnectionId?: string } {
    this.tick();
    const room = this.rooms.get(this.cleanCode(session.roomCode));
    const player = room?.players.get(session.playerId);
    if (!room || !player || player.left || !this.tokensEqual(player.token, session.token)) {
      throw new GameError('SESSION_EXPIRED', 'Your session has expired. Join the room again.');
    }
    const existing = this.bindings.get(connectionId);
    if (existing && (existing.playerId !== player.id || existing.roomCode !== room.code)) {
      throw new GameError('ALREADY_JOINED', 'Leave your current room before joining another.');
    }
    const replacedConnectionId =
      player.connectionId && player.connectionId !== connectionId ? player.connectionId : undefined;
    if (replacedConnectionId) this.bindings.delete(replacedConnectionId);
    player.connectionId = connectionId;
    player.disconnectedAt = null;
    room.emptySince = null;
    this.bindings.set(connectionId, { roomCode: room.code, playerId: player.id });
    this.migrateHost(room);
    this.changed();
    return replacedConnectionId ? { replacedConnectionId } : {};
  }

  leave(connectionId: string): void {
    const binding = this.bindings.get(connectionId);
    if (!binding) return;
    const room = this.rooms.get(binding.roomCode);
    const player = room?.players.get(binding.playerId);
    this.bindings.delete(connectionId);
    if (!room || !player) return;
    player.connectionId = null;
    player.disconnectedAt = this.now();
    player.left = true;
    if (room.phase === 'LOBBY' || room.phase === 'RESULTS') room.players.delete(player.id);
    this.migrateHost(room);
    if (activeRound(room) && room.touristPlayerId === player.id) {
      this.finish(room, 'TRAVELERS', 'The Tourist left the room.');
    } else {
      this.advanceWhenComplete(room);
    }
    if (connectedPlayers(room).length === 0) {
      room.emptySince ??= this.now();
      if ([...room.players.values()].every((member) => member.left)) this.rooms.delete(room.code);
    }
    this.changed();
  }

  disconnect(connectionId: string): void {
    const binding = this.bindings.get(connectionId);
    if (!binding) return;
    const room = this.rooms.get(binding.roomCode);
    const player = room?.players.get(binding.playerId);
    this.bindings.delete(connectionId);
    if (!room || !player || player.connectionId !== connectionId) return;
    player.connectionId = null;
    player.disconnectedAt = this.now();
    this.migrateHost(room);
    this.advanceWhenComplete(room);
    if (connectedPlayers(room).length === 0) room.emptySince ??= this.now();
    this.changed();
  }

  start(connectionId: string, roundNumber: number): void {
    const { room, player } = this.authorize(connectionId, roundNumber, 'LOBBY');
    this.requireHost(room, player);
    this.beginRound(room);
  }

  setTestMode(connectionId: string, roundNumber: number, enabled: boolean): void {
    const { room, player } = this.authorize(connectionId, roundNumber, ['LOBBY', 'RESULTS']);
    this.requireHost(room, player);
    if (!this.testModeAvailable) {
      throw new GameError(
        'TEST_MODE_UNAVAILABLE',
        'Test Mode is only available on the development server.',
      );
    }
    if (typeof enabled !== 'boolean') {
      throw new GameError('INVALID_PAYLOAD', 'Choose whether Test Mode is enabled.');
    }
    room.testMode = enabled;
    this.changed();
  }

  next(connectionId: string, roundNumber: number): void {
    const { room, player } = this.authorize(connectionId, roundNumber, 'RESULTS');
    this.requireHost(room, player);
    this.beginRound(room);
  }

  ready(connectionId: string, roundNumber: number): void {
    const { room, player } = this.authorize(connectionId, roundNumber, 'ROLE_REVEAL');
    player.ready = true;
    this.advanceWhenComplete(room);
    this.changed();
  }

  startVote(connectionId: string, roundNumber: number): void {
    const { room, player } = this.authorize(connectionId, roundNumber, 'DISCUSSION');
    this.requireHost(room, player);
    this.transition(room, 'VOTING');
  }

  vote(connectionId: string, roundNumber: number, targetId: string): void {
    const { room, player } = this.authorize(connectionId, roundNumber, 'VOTING');
    if (room.votes.has(player.id))
      throw new GameError('ALREADY_VOTED', 'Your vote is already submitted and locked.');
    if (player.id === targetId)
      throw new GameError('SELF_VOTE', 'Choose another player. You cannot vote for yourself.');
    const target = room.players.get(targetId);
    if (!target || target.left || !room.participantIds.has(targetId)) {
      throw new GameError(
        'INVALID_TARGET',
        'That player has left the round. Choose another player.',
      );
    }
    room.votes.set(player.id, targetId);
    this.advanceWhenComplete(room);
    this.changed();
  }

  guess(connectionId: string, roundNumber: number, countryId: string): void {
    const { room, player } = this.authorize(connectionId, roundNumber, 'FINAL_GUESS');
    if (room.touristPlayerId !== player.id)
      throw new GameError('TOURIST_ONLY', 'Only the Tourist can make the final guess.');
    const country = COUNTRIES.find((item) => item.id === countryId);
    if (!country) throw new GameError('INVALID_COUNTRY', 'Choose a country from the list.');
    room.touristGuess = country;
    this.finish(
      room,
      country.id === room.country?.id ? 'TOURIST' : 'TRAVELERS',
      country.id === room.country?.id
        ? 'The Tourist guessed the destination.'
        : 'The Tourist guessed the wrong destination.',
    );
  }

  tick(): void {
    const now = this.now();
    for (const room of this.rooms.values()) {
      if (room.emptySince !== null && now - room.emptySince >= this.emptyRoomTtlMs) {
        this.rooms.delete(room.code);
        this.changed();
        continue;
      }
      if (room.phase === 'LOBBY' || room.phase === 'RESULTS') {
        for (const player of room.players.values()) {
          if (
            player.disconnectedAt !== null &&
            now - player.disconnectedAt >= this.reconnectGraceMs
          ) {
            room.players.delete(player.id);
            this.changed();
          }
        }
        this.migrateHost(room);
      }
      if (!activeRound(room)) continue;
      const tourist = room.touristPlayerId ? room.players.get(room.touristPlayerId) : undefined;
      if (
        tourist?.disconnectedAt !== null &&
        tourist?.disconnectedAt !== undefined &&
        now - tourist.disconnectedAt >= this.reconnectGraceMs
      ) {
        this.finish(room, 'TRAVELERS', 'The Tourist did not reconnect in time.');
        continue;
      }
      if (room.deadline !== null && now >= room.deadline) {
        switch (room.phase) {
          case 'ROLE_REVEAL':
            this.transition(room, 'DISCUSSION');
            break;
          case 'DISCUSSION':
            this.transition(room, 'VOTING');
            break;
          case 'VOTING':
            this.resolveVotes(room);
            break;
          case 'FINAL_GUESS':
            this.finish(room, 'TRAVELERS', 'The Tourist ran out of time to guess.');
            break;
        }
      }
    }
  }

  getState(connectionId: string): ClientState | null {
    const binding = this.bindings.get(connectionId);
    if (!binding) return null;
    const room = this.rooms.get(binding.roomCode);
    const player = room?.players.get(binding.playerId);
    if (!room || !player || player.connectionId !== connectionId) return null;
    const participant = room.participantIds.has(player.id);
    const role = participant ? (room.touristPlayerId === player.id ? 'TOURIST' : 'TRAVELER') : null;
    const state: ClientState = {
      roomCode: room.code,
      hostPlayerId: room.hostPlayerId,
      youId: player.id,
      players: [...room.players.values()].map((member) => ({
        id: member.id,
        displayName: member.displayName,
        connected: member.connectionId !== null && !member.left,
        active: !member.left,
        ready: member.ready,
        hasVoted: room.votes.has(member.id),
      })),
      phase: room.phase,
      roundNumber: room.roundNumber,
      testModeAvailable: this.testModeAvailable,
      testMode: room.testMode,
      minPlayers: this.minimumPlayers(room),
      deadline: room.deadline,
      serverNow: this.now(),
      role,
    };
    if (role === 'TRAVELER' && room.country) state.country = { ...room.country };
    if (room.phase === 'RESULTS' && room.results) {
      state.results = {
        ...room.results,
        roster: room.results.roster.map((member) => ({ ...member })),
        country: { ...room.results.country },
        touristGuess: room.results.touristGuess ? { ...room.results.touristGuess } : null,
        votes: room.results.votes.map((vote) => ({ ...vote })),
      };
    }
    return state;
  }

  getStates(): Array<{ connectionId: string; state: ClientState }> {
    const states: Array<{ connectionId: string; state: ClientState }> = [];
    for (const connectionId of this.bindings.keys()) {
      const state = this.getState(connectionId);
      if (state) states.push({ connectionId, state });
    }
    return states;
  }

  private authorize(
    connectionId: string,
    roundNumber: number,
    phase: Phase | readonly Phase[],
  ): { room: Room; player: Player } {
    this.tick();
    const binding = this.bindings.get(connectionId);
    const room = binding ? this.rooms.get(binding.roomCode) : undefined;
    const player = binding ? room?.players.get(binding.playerId) : undefined;
    if (!room || !player || player.connectionId !== connectionId || player.left) {
      throw new GameError('NOT_JOINED', 'Join a room before taking that action.');
    }
    if (!Number.isInteger(roundNumber) || roundNumber !== room.roundNumber) {
      throw new GameError(
        'STALE_ROUND',
        'The round has changed. Use the current screen and try again.',
      );
    }
    const allowedPhases = typeof phase === 'string' ? [phase] : phase;
    if (!allowedPhases.includes(room.phase))
      throw new GameError('WRONG_PHASE', 'That action is not available in this phase.');
    return { room, player };
  }

  private beginRound(room: Room): void {
    const players = connectedPlayers(room);
    const minimum = this.minimumPlayers(room);
    if (players.length < minimum)
      throw new GameError(
        'NOT_ENOUGH_PLAYERS',
        `At least ${minimum} connected players are needed to start.`,
      );
    for (const player of room.players.values()) {
      if (!player.connectionId || player.left) room.players.delete(player.id);
    }
    const countryPool = COUNTRIES.filter((country) => country.id !== room.previousCountryId);
    const forced =
      room.roundNumber === 0 && this.options.forceFirstCountryId
        ? countryPool.find((country) => country.id === this.options.forceFirstCountryId)
        : undefined;
    room.country = forced ?? this.pick(countryPool);
    const touristPool = players.filter((player) => player.id !== room.previousTouristId);
    room.touristPlayerId = this.pick(touristPool.length > 0 ? touristPool : players).id;
    room.previousCountryId = room.country.id;
    room.previousTouristId = room.touristPlayerId;
    room.participantIds = new Set(players.map((player) => player.id));
    room.roundNumber += 1;
    room.votes.clear();
    room.touristGuess = null;
    room.results = null;
    room.startedAt = this.now();
    for (const player of players) player.ready = false;
    this.transition(room, 'ROLE_REVEAL');
  }

  private advanceWhenComplete(room: Room): void {
    const eligible = connectedParticipants(room);
    if (eligible.length === 0) return;
    if (room.phase === 'ROLE_REVEAL' && eligible.every((player) => player.ready)) {
      this.transition(room, 'DISCUSSION');
    } else if (room.phase === 'VOTING' && eligible.every((player) => room.votes.has(player.id))) {
      this.resolveVotes(room);
    }
  }

  private resolveVotes(room: Room): void {
    const totals = new Map<string, number>();
    for (const target of room.votes.values()) totals.set(target, (totals.get(target) ?? 0) + 1);
    const highest = Math.max(0, ...totals.values());
    const leaders = [...totals.entries()]
      .filter(([, count]) => count === highest)
      .map(([id]) => id);
    if (leaders.length === 1 && leaders[0] === room.touristPlayerId) {
      this.transition(room, 'FINAL_GUESS');
    } else {
      this.finish(
        room,
        'TOURIST',
        leaders.length > 1
          ? 'The vote was tied. The Tourist escaped.'
          : highest === 0
            ? 'No votes were submitted. The Tourist escaped.'
            : 'The Tourist avoided the most votes.',
      );
    }
  }

  private finish(room: Room, winner: Winner, reason: string): void {
    if (!room.country || !room.touristPlayerId || room.phase === 'RESULTS') return;
    room.results = {
      roster: [...room.players.values()]
        .filter((player) => room.participantIds.has(player.id))
        .map(({ id, displayName }) => ({ id, displayName })),
      country: room.country,
      touristPlayerId: room.touristPlayerId,
      votes: [...room.votes.entries()].map(([voterId, targetId]) => ({ voterId, targetId })),
      touristGuess: room.touristGuess,
      winner,
      reason,
    };
    this.transition(room, 'RESULTS');
    for (const player of room.players.values()) {
      if (player.left) room.players.delete(player.id);
    }
    this.migrateHost(room);
    if (this.options.onSummary) {
      const labels = new Map(
        [...room.participantIds].map((id, index) => [id, `player-${index + 1}`]),
      );
      const voteDistribution: Record<string, number> = {};
      for (const target of room.votes.values()) {
        const label = labels.get(target) ?? 'departed-player';
        voteDistribution[label] = (voteDistribution[label] ?? 0) + 1;
      }
      this.options.onSummary({
        roomCode: room.code,
        roundNumber: room.roundNumber,
        playerCount: room.participantIds.size,
        country: room.country.name,
        tourist: labels.get(room.touristPlayerId) ?? 'departed-player',
        voteDistribution,
        touristGuess: room.touristGuess?.name ?? null,
        winner,
        durationMs: this.now() - (room.startedAt ?? this.now()),
      });
    }
  }

  private transition(room: Room, phase: Phase): void {
    room.phase = phase;
    room.deadline =
      phase === 'LOBBY' || phase === 'RESULTS' ? null : this.now() + this.durations[phase];
    this.changed();
  }

  private migrateHost(room: Room): void {
    const currentHost = room.players.get(room.hostPlayerId);
    if (currentHost?.connectionId && !currentHost.left) return;
    const nextHost = connectedPlayers(room)[0];
    if (nextHost && room.hostPlayerId !== nextHost.id) {
      room.hostPlayerId = nextHost.id;
      this.changed();
    }
  }

  private requireHost(room: Room, player: Player): void {
    if (room.hostPlayerId !== player.id)
      throw new GameError('HOST_ONLY', 'Only the host can do that.');
  }

  private minimumPlayers(room: Room): 2 | 4 {
    return this.testModeAvailable && room.testMode ? TEST_MIN_PLAYERS : MIN_PLAYERS;
  }

  private requireUnbound(connectionId: string): void {
    if (this.bindings.has(connectionId))
      throw new GameError('ALREADY_JOINED', 'Leave your current room before joining another.');
  }

  private cleanName(displayName: string): string {
    if (typeof displayName !== 'string')
      throw new GameError('INVALID_NAME', 'Enter a player name.');
    const name = displayName.trim().replace(/\s+/gu, ' ');
    if (name.length < 1 || [...name].length > 24 || /\p{C}/u.test(name)) {
      throw new GameError('INVALID_NAME', 'Use a name between 1 and 24 characters.');
    }
    return name;
  }

  private cleanCode(roomCode: string): string {
    if (typeof roomCode !== 'string' || !/^[A-Z2-9]{6}$/.test(roomCode.trim().toUpperCase())) {
      throw new GameError('INVALID_ROOM_CODE', 'Enter the 6-character room code.');
    }
    return roomCode.trim().toUpperCase();
  }

  private newPlayer(connectionId: string, displayName: string): Player {
    return {
      id: randomUUID(),
      displayName,
      token: randomBytes(32).toString('hex'),
      connectionId,
      disconnectedAt: null,
      left: false,
      ready: false,
    };
  }

  private session(room: Room, player: Player): Session {
    return { roomCode: room.code, playerId: player.id, token: player.token };
  }

  private tokensEqual(expected: string, actual: string): boolean {
    if (typeof actual !== 'string' || expected.length !== actual.length) return false;
    const expectedBytes = Buffer.from(expected);
    const actualBytes = Buffer.from(actual);
    return (
      expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes)
    );
  }

  private pick<T>(items: readonly T[]): T {
    const selected =
      items[Math.min(items.length - 1, Math.max(0, Math.floor(this.random() * items.length)))];
    if (selected === undefined) throw new Error('Cannot select from an empty pool.');
    return selected;
  }

  private changed(): void {
    this.revision += 1;
  }
}
