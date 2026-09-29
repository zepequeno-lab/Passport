import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const frontendUrl = 'http://127.0.0.1:5173';
const gameUrl = 'http://127.0.0.1:3001';
const downloads =
  'https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/';

async function share(): Promise<number> {
  const installed = spawnSync('cloudflared', ['--version'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 5_000,
  });
  if (installed.error || installed.status !== 0) {
    console.error(
      'Cloudflare Tunnel could not be started. Install cloudflared and add it to PATH.',
    );
    if (process.platform === 'win32') {
      console.error('On Windows: winget install --id Cloudflare.cloudflared --exact');
      console.error('Then open a new terminal and run npm run share again.');
    }
    console.error(`Official installer: ${downloads}`);
    if (installed.error && (installed.error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`cloudflared check: ${installed.error.message}`);
    }
    return 1;
  }

  const configured = ['config.yaml', 'config.yml'].find((name) =>
    existsSync(join(homedir(), '.cloudflared', name)),
  );
  if (configured) {
    console.error(
      `A .cloudflared/${configured} file is present. Quick Tunnels require an unconfigured cloudflared session.`,
    );
    console.error(
      'Temporarily move that configuration yourself, or use your existing named tunnel. No files were changed.',
    );
    return 1;
  }

  try {
    const [frontend, game] = await Promise.all([
      fetch(frontendUrl, { signal: AbortSignal.timeout(5_000) }),
      fetch(gameUrl, { signal: AbortSignal.timeout(5_000) }),
    ]);
    if (!frontend.ok || !game.ok) throw new Error('A local server is not ready.');
    const health: unknown = await game.json();
    if (
      !health ||
      typeof health !== 'object' ||
      !('service' in health) ||
      health.service !== 'passport-game'
    ) {
      throw new Error('Port 3001 is not running the Passport game server.');
    }
  } catch (error) {
    console.error(
      'Start npm run dev in another terminal before sharing. Both ports 5173 and 3001 must be running.',
    );
    console.error('Use npm run ports to see which processes own those ports.');
    if (error instanceof Error) console.error(error.message);
    return 1;
  }

  console.log('Opening a temporary public link to Passport.');
  console.log(
    'Share the https://...trycloudflare.com address printed below, then share your room code.',
  );
  console.log('Keep this terminal and npm run dev open. Press Ctrl+C here to stop sharing.');

  const tunnel = spawn('cloudflared', ['tunnel', '--url', frontendUrl], {
    stdio: 'inherit',
    windowsHide: true,
  });
  let stopping = false;
  const stop = () => {
    stopping = true;
    tunnel.kill('SIGTERM');
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return new Promise<number>((resolve) => {
    tunnel.once('error', (error) => {
      console.error(`Could not open the tunnel: ${error.message}`);
    });
    tunnel.once('close', (code) => {
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
      if (!stopping && code !== 0)
        console.error(
          'The tunnel stopped. Check the cloudflared output above, then run npm run share again.',
        );
      resolve(stopping ? 0 : (code ?? 1));
    });
  });
}

process.exitCode = await share();
