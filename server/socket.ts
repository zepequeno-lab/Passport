import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { z } from 'zod';
import type {
  Ack,
  ClientToServerEvents,
  ServerToClientEvents,
  Session,
} from '../src/lib/shared/types.js';
import { GameEngine, GameError, type EngineOptions } from './engine.js';

export interface GameServerOptions extends EngineOptions {
  allowedOrigins?: string[];
  tickMs?: number;
}

const name = z.string().min(1).max(96);
const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z2-9]{6}$/);
const round = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const roundAction = z.object({ roundNumber: round }).strict();
const sessionSchema = z
  .object({
    roomCode: code,
    playerId: z.string().uuid(),
    token: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export function attachGameServer(httpServer: HttpServer, options: GameServerOptions = {}) {
  const engine = new GameEngine(options);
  const origins = new Set(
    options.allowedOrigins ?? ['http://localhost:5173', 'http://127.0.0.1:5173'],
  );
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    maxHttpBufferSize: 8_192,
    cors: { origin: [...origins] },
    allowRequest: (request, done) => {
      const origin = request.headers.origin;
      if (!origin) {
        done(null, true);
        return;
      }
      try {
        done(null, origins.has(origin) || new URL(origin).host === request.headers.host);
      } catch {
        done(null, false);
      }
    },
  });

  let publishedRevision = -1;
  const publish = () => {
    if (publishedRevision === engine.revision) return;
    publishedRevision = engine.revision;
    for (const { connectionId, state } of engine.getStates())
      io.to(connectionId).emit('room:state', state);
  };

  io.on('connection', (socket) => {
    let rateWindow = Date.now();
    let actionCount = 0;

    const handle =
      <T>(schema: z.ZodType<T>, action: (payload: T) => Session | void) =>
      (payload: unknown, callback: unknown): void => {
        const respond = (response: Ack) => {
          if (typeof callback === 'function') callback(response);
        };
        try {
          if (Date.now() - rateWindow > 10_000) {
            actionCount = 0;
            rateWindow = Date.now();
          }
          actionCount += 1;
          if (actionCount > 80)
            throw new GameError(
              'RATE_LIMITED',
              'Too many actions. Wait a few seconds and try again.',
            );
          const parsed = schema.safeParse(payload);
          if (!parsed.success)
            throw new GameError(
              'INVALID_PAYLOAD',
              'That request was not valid. Check your entry and try again.',
            );
          const session = action(parsed.data);
          respond(session ? { ok: true, session } : { ok: true });
        } catch (error) {
          if (error instanceof GameError)
            respond({ ok: false, error: error.message, code: error.code });
          else {
            console.error(
              'Game action failed:',
              error instanceof Error ? error.message : 'Unknown error',
            );
            respond({
              ok: false,
              error: 'Something went wrong. Try the action again.',
              code: 'SERVER_ERROR',
            });
          }
        } finally {
          publish();
        }
      };

    socket.on(
      'room:create',
      handle(z.object({ displayName: name }).strict(), ({ displayName }) =>
        engine.create(socket.id, displayName),
      ),
    );
    socket.on(
      'room:join',
      handle(
        z.object({ displayName: name, roomCode: code }).strict(),
        ({ roomCode, displayName }) => engine.join(socket.id, roomCode, displayName),
      ),
    );
    socket.on(
      'room:resume',
      handle(sessionSchema, (session) => {
        const { replacedConnectionId } = engine.resume(socket.id, session);
        if (replacedConnectionId) {
          const previous = io.sockets.sockets.get(replacedConnectionId);
          previous?.emit('room:replaced');
          previous?.disconnect(true);
        }
        return session;
      }),
    );
    socket.on(
      'room:leave',
      handle(z.object({}).strict(), () => engine.leave(socket.id)),
    );
    socket.on(
      'room:test-mode',
      handle(roundAction.extend({ enabled: z.boolean() }), ({ roundNumber, enabled }) =>
        engine.setTestMode(socket.id, roundNumber, enabled),
      ),
    );
    socket.on(
      'game:start',
      handle(roundAction, ({ roundNumber }) => engine.start(socket.id, roundNumber)),
    );
    socket.on(
      'game:ready',
      handle(roundAction, ({ roundNumber }) => engine.ready(socket.id, roundNumber)),
    );
    socket.on(
      'game:start-vote',
      handle(roundAction, ({ roundNumber }) => engine.startVote(socket.id, roundNumber)),
    );
    socket.on(
      'game:vote',
      handle(roundAction.extend({ targetId: z.string().uuid() }), ({ roundNumber, targetId }) =>
        engine.vote(socket.id, roundNumber, targetId),
      ),
    );
    socket.on(
      'game:guess',
      handle(
        roundAction.extend({ countryId: z.string().regex(/^[A-Z]{2}$/) }),
        ({ roundNumber, countryId }) => engine.guess(socket.id, roundNumber, countryId),
      ),
    );
    socket.on(
      'game:next',
      handle(roundAction, ({ roundNumber }) => engine.next(socket.id, roundNumber)),
    );
    socket.on('disconnect', () => {
      engine.disconnect(socket.id);
      publish();
    });
  });

  const timer = setInterval(() => {
    engine.tick();
    publish();
  }, options.tickMs ?? 250);
  timer.unref();
  const close = async () => {
    clearInterval(timer);
    await new Promise<void>((resolve) => io.close(() => resolve()));
  };
  return { io, engine, close };
}
