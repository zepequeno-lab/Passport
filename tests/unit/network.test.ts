import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { attachGameServer } from '../../server/socket.js';

describe('same-origin friend connections', () => {
  let game: ReturnType<typeof attachGameServer>;
  let port: number;
  const clients: Socket[] = [];
  const publicHost = 'passport-friends-example.trycloudflare.com';

  beforeEach(async () => {
    const server = createServer();
    game = attachGameServer(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.disconnect();
    await game.close();
  });

  function connect(origin: string): Promise<Socket> {
    const client = io(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      extraHeaders: { Host: publicHost, Origin: origin },
      reconnection: false,
      forceNew: true,
      timeout: 2_000,
    });
    clients.push(client);
    return new Promise((resolve, reject) => {
      client.once('connect', () => resolve(client));
      client.once('connect_error', reject);
    });
  }

  it('accepts a tunneled WebSocket when the preserved Host matches its HTTPS Origin', async () => {
    const client = await connect(`https://${publicHost}`);
    const response: unknown = await client
      .timeout(2_000)
      .emitWithAck('room:create', { displayName: 'Remote friend' });
    expect(response).toMatchObject({ ok: true, session: { roomCode: expect.any(String) } });
  });

  it('accepts polling fallback through the same public origin', async () => {
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const handshake = request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/socket.io/?EIO=4&transport=polling',
          headers: { Host: publicHost, Origin: `https://${publicHost}` },
        },
        (response) => {
          response.resume();
          response.once('end', () => resolve(response.statusCode));
        },
      );
      handshake.once('error', reject);
      handshake.end();
    });
    expect(status).toBe(200);
  });

  it('rejects an unrelated site even when it uses another trycloudflare hostname', async () => {
    await expect(connect('https://unrelated-site.trycloudflare.com')).rejects.toThrow();
    expect(game.engine.roomCount).toBe(0);
  });
});
