import type { Country, Phase, RoundResults } from '../src/lib/shared/types.js';

export interface Player {
  id: string;
  displayName: string;
  token: string;
  connectionId: string | null;
  disconnectedAt: number | null;
  left: boolean;
  ready: boolean;
}

export interface Room {
  code: string;
  hostPlayerId: string;
  players: Map<string, Player>;
  phase: Phase;
  roundNumber: number;
  testMode: boolean;
  participantIds: Set<string>;
  country: Country | null;
  touristPlayerId: string | null;
  previousCountryId: string | null;
  previousTouristId: string | null;
  votes: Map<string, string>;
  touristGuess: Country | null;
  results: RoundResults | null;
  deadline: number | null;
  startedAt: number | null;
  emptySince: number | null;
}

export function connectedPlayers(room: Room): Player[] {
  return [...room.players.values()].filter(
    (player) => player.connectionId !== null && !player.left,
  );
}

export function connectedParticipants(room: Room): Player[] {
  return connectedPlayers(room).filter((player) => room.participantIds.has(player.id));
}

export function activeRound(room: Room): boolean {
  return room.phase !== 'LOBBY' && room.phase !== 'RESULTS';
}
