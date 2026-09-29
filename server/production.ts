import { createServer, type RequestListener } from 'node:http';
import { attachGameServer } from './socket.js';

// The adapter creates this module during `npm run build`.
const buildHandlerPath = '../build/handler.js';
const { handler } = (await import(buildHandlerPath)) as { handler: RequestListener };
const server = createServer(handler);
const game = attachGameServer(server, {
  allowedOrigins: process.env.ORIGIN ? [process.env.ORIGIN] : [],
  onSummary:
    process.env.PASSPORT_ROUND_LOG === '1'
      ? (summary) => console.info('[round]', JSON.stringify(summary))
      : undefined,
});
const port = Number(process.env.PORT ?? 3000);
server.listen(port, process.env.HOST ?? '0.0.0.0', () => {
  console.info(`Passport listening on port ${port}`);
});
const shutdown = async () => {
  await game.close();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
