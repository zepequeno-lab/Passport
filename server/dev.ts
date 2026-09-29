import { createServer } from 'node:http';
import { attachGameServer } from './socket.js';
import type { EngineOptions } from './engine.js';

function duration(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const result = Number(value);
  return Number.isFinite(result) && result >= 1_000 ? result : undefined;
}

const options: EngineOptions = {
  allowTestMode: process.env.NODE_ENV !== 'production',
  forceFirstCountryId: process.env.PASSPORT_FIRST_COUNTRY,
  roleRevealMs: duration(process.env.PASSPORT_REVEAL_MS),
  discussionMs: duration(process.env.PASSPORT_DISCUSSION_MS),
  votingMs: duration(process.env.PASSPORT_VOTING_MS),
  finalGuessMs: duration(process.env.PASSPORT_GUESS_MS),
  onSummary:
    process.env.PASSPORT_ROUND_LOG === '1'
      ? (summary) => console.info('[round]', JSON.stringify(summary))
      : undefined,
};

const port = Number(process.env.GAME_PORT ?? 3001);
const server = createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ service: 'passport-game', status: 'ok' }));
});
const game = attachGameServer(server, options);
server.listen(port, '0.0.0.0', () =>
  console.info(`Passport game server listening on port ${port}`),
);

const shutdown = async () => {
  await game.close();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
