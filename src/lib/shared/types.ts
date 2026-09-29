export const PHASES = [
  'LOBBY',
  'ROLE_REVEAL',
  'DISCUSSION',
  'VOTING',
  'FINAL_GUESS',
  'RESULTS',
] as const;
export type Phase = (typeof PHASES)[number];
export type Role = 'TRAVELER' | 'TOURIST';
export type Winner = 'TRAVELERS' | 'TOURIST';

export interface Country {
  id: string;
  name: string;
}

export interface PublicPlayer {
  id: string;
  displayName: string;
  connected: boolean;
  /** Temporarily disconnected players remain part of the round and can receive votes. */
  active: boolean;
  ready: boolean;
  hasVoted: boolean;
}

export interface RoundResults {
  /** Round participants are retained here even after their seats become available. */
  roster: Array<{ id: string; displayName: string }>;
  country: Country;
  touristPlayerId: string;
  votes: Array<{ voterId: string; targetId: string }>;
  touristGuess: Country | null;
  winner: Winner;
  reason: string;
}

/** Each snapshot is built individually. Secret fields are absent for the Tourist. */
export interface ClientState {
  roomCode: string;
  hostPlayerId: string;
  youId: string;
  players: PublicPlayer[];
  phase: Phase;
  roundNumber: number;
  testModeAvailable: boolean;
  testMode: boolean;
  minPlayers: 2 | 4;
  deadline: number | null;
  serverNow: number;
  role: Role | null;
  country?: Country;
  results?: RoundResults;
}

export interface Session {
  roomCode: string;
  playerId: string;
  token: string;
}

export type Ack = { ok: true; session?: Session } | { ok: false; error: string; code?: string };
export type AckCallback = (response: Ack) => void;
export interface RoundAction {
  roundNumber: number;
}

export interface ClientToServerEvents {
  'room:create': (payload: { displayName: string }, ack: AckCallback) => void;
  'room:join': (payload: { displayName: string; roomCode: string }, ack: AckCallback) => void;
  'room:resume': (payload: Session, ack: AckCallback) => void;
  'room:leave': (payload: Record<string, never>, ack: AckCallback) => void;
  'room:test-mode': (payload: RoundAction & { enabled: boolean }, ack: AckCallback) => void;
  'game:start': (payload: RoundAction, ack: AckCallback) => void;
  'game:ready': (payload: RoundAction, ack: AckCallback) => void;
  'game:start-vote': (payload: RoundAction, ack: AckCallback) => void;
  'game:vote': (payload: RoundAction & { targetId: string }, ack: AckCallback) => void;
  'game:guess': (payload: RoundAction & { countryId: string }, ack: AckCallback) => void;
  'game:next': (payload: RoundAction, ack: AckCallback) => void;
}

export interface ServerToClientEvents {
  'room:state': (state: ClientState) => void;
  'room:replaced': () => void;
}
