# PASSPORT

A local-first multiplayer geography party game for 4-10 friends.

**Everyone knows the country except one person. Find them before they figure out where you are.**

Create a private room, share its code, and talk in person or over your usual voice call. Every Traveler receives the same country. One Tourist receives only their role. Ready up, discuss, vote, and see whether the Tourist can escape or steal the win with a final country guess.

## Run locally

Requires Node.js 22.12 or newer and npm.

```sh
npm install
npx playwright install chromium
npm run dev
```

Open **http://localhost:5173**. The development command runs the SvelteKit frontend on port 5173 and the game server on port 3001. Vite proxies Socket.IO traffic to the game server, so clients use one origin.

For another device on your local network, open `http://YOUR_COMPUTER_LAN_IP:5173`. Allow the development server through your local firewall if needed.

## Testing with Friends

1. Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/). On Windows, run `winget install --id Cloudflare.cloudflared --exact`, then open a new terminal.
2. Run `npm run dev` and leave it running.
3. In a second terminal, run `npm run share`. Copy the `https://...trycloudflare.com` link printed by cloudflared and send it to your friends.
4. Everyone opens that same link. One player creates a room and shares its room code; the others join it. Use your usual voice call to talk.
5. With only two people, the host enables **TEST MODE** in the lobby. This development option keeps the normal voting rules. To try the final guess with two players, have only the Traveler vote and let the voting timer finish. Production always requires at least four players.

Both the page and Socket.IO use the shared link. Friends do not connect to your localhost or port 3001 directly. The temporary tunnel works across networks and ends when its terminal closes. Keep both terminals open during the game; press Ctrl+C in each when finished. [Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/) are intended for temporary playtesting, and the public URL changes when restarted.

If a port is already occupied, run `npm run ports` to display the listening process IDs without stopping anything. Close your previous development terminal with Ctrl+C before starting another. If cloudflared is missing, `npm run share` prints installation instructions. An existing `.cloudflared/config.yaml` or `config.yml` can prevent a Quick Tunnel; the script reports it without changing your configuration.

## Fastest six-player playtest

Keep `npm run dev` running. In a second terminal:

```sh
npm run playtest
```

The script opens six visible Chromium windows with independent browser contexts, creates one room, and joins Ava, Zain, Maya, Omar, Lina, and Theo. Ava is the host. Click **Start game** in her window. Switch between the windows to read each role, click **I’m ready**, vote, and make the Tourist’s final guess. The script leaves all game decisions to you. Press Ctrl+C in the playtest terminal to close the windows.

You can also open separate browser tabs manually: sessions are stored per tab. A new browser context or private window ensures a completely fresh identity; duplicating an existing tab may copy its session.

Set `PLAYTEST_URL` to use the script against another running local instance. The playtest helper is a separate development script and adds no controls to the normal game UI.

## Rules and timing

- A room needs 4-10 connected players to start. Only the host can start a round or move discussion to voting early.
- Role reveal automatically advances after 30 seconds if someone does not ready up. Discussion lasts 3 minutes by default.
- Each player gets one submitted vote and cannot vote for themselves. Pending selections can change before submission. Vote counts stay private until results.
- Voting has a 30-second deadline. A tie for the highest vote count means the Tourist survives.
- A caught Tourist has 30 seconds to choose one country from the 45-country pool. A correct answer wins for the Tourist; a wrong answer or no answer wins for the Travelers.
- Next round keeps the room and players, clears votes/readiness/guess, increments the round number, and avoids repeating the previous country.
- Refreshing a tab resumes the same player and role. A disconnected host passes control to another connected player. Disconnected players have a 45-second grace period; voluntarily leaving takes effect immediately. The Tourist leaving ends the round with a Travelers win. The final-guess deadline still applies during a disconnect.

The server owns the deadlines. Browser timers show remaining time from server timestamps, and refreshing does not restart a phase. Connected players determine when everyone is ready or has voted; submitted votes remain counted if their voters disconnect. New players can join in the lobby or between rounds. Starting the next round removes disconnected players from the roster.

## Architecture

- **Frontend:** SvelteKit 2, Svelte 5, strict TypeScript, and Tailwind CSS 4 with shared layout and control components.
- **Realtime:** Node.js and typed Socket.IO events. A server-side state machine validates all actions and runs `LOBBY → ROLE_REVEAL → DISCUSSION → VOTING → FINAL_GUESS → RESULTS`; an uncaught Tourist goes directly from voting to results.
- **State:** Rooms, resume tokens, and round state live in server memory. There is no database or authentication.
- **Privacy:** The server builds a separate safe snapshot for each player. Before results, the Tourist’s game payload omits the chosen country; voting counts and other players’ roles remain private. The public list of possible guesses is not secret.
- **Testing:** Vitest covers engine rules and Socket.IO behavior. Playwright uses isolated browser contexts for real multiplayer flows and captures responsive screenshots with geometry checks.

## Commands

```sh
npm run dev           # Frontend + realtime development servers
npm run share         # Public friend playtest link through cloudflared
npm run ports         # Report listeners and PIDs on 5173 and 3001
npm run check         # Svelte and strict TypeScript checks
npm test              # Unit and integration tests
npm run test:e2e      # Chromium multiplayer and responsive tests; starts dev servers if needed
npm run format       # Format source and documentation
npm run format:check # Verify formatting
npm run build        # Production SvelteKit build
npm start            # Serve the production build and Socket.IO together
npm run test:all      # Type checks, unit tests, build, and browser tests
```

Run `npm run build` before `npm start`. Production runs as a single Node process at http://localhost:3000; configure its port with `PORT`, bind address with `HOST`, and public origin with `ORIGIN` when hosting behind a reverse proxy.

Browser test screenshots and failure traces are written under `test-results/`; the HTML report is under `playwright-report/`. Open it with `npx playwright show-report`. The responsive suite checks 320, 375, 390, 430, 768, 1024, 1280, and 1440-pixel widths, including a full room and long or multilingual player names. Screenshots support human visual review; they are not brittle pixel baselines.

To test an already-running production build, set `PASSPORT_E2E_URL=http://127.0.0.1:3000` before `npm run test:e2e`. This skips the managed development server.

## Playtesting and limitations

Use [PLAYTEST.md](PLAYTEST.md) to record reactions after ten rounds. Set `PASSPORT_ROUND_LOG=1` before starting the server to print optional round summaries: room code, player count, country, Tourist, vote distribution, final guess, winner, and duration. Player labels are anonymous (`player-1`, etc.); display names, session tokens, and contact information are not logged.

Development-only settings can reproduce a scenario: `PASSPORT_FIRST_COUNTRY=JP` makes the first round Japan. `PASSPORT_REVEAL_MS`, `PASSPORT_DISCUSSION_MS`, `PASSPORT_VOTING_MS`, and `PASSPORT_GUESS_MS` override phase durations in milliseconds (minimum 1000). For example, in PowerShell:

```powershell
$env:PASSPORT_FIRST_COUNTRY = 'JP'
$env:PASSPORT_ROUND_LOG = '1'
npm run dev
```

These country and timing overrides are not used by the production entry point.

This MVP is intended to prove the game loop. Rooms disappear when the server restarts, and a fully empty room expires after five minutes. There is no cross-server scaling, persistent identity, voice/text chat, public matchmaking, moderation dashboard, analytics service, or reconnect across unrelated browser sessions. Play with friends through an existing call. A player’s private information is visible on their own screen, so keep it out of shared screen broadcasts.

The passport opens into a two-page desktop spread and vertically stacked pages on phones. A fresh guest sees the How to Play insert after choosing Play as Guest, and can reopen it from the passport toolbar. Future login completion can call `PassportProfile.completeIdentity('authenticated')` to trigger the same insert after successful authentication.

Avatars use the DiceBear HTTP SVG service with stable, URL-encoded seeds and a local illustrated fallback. The [Adventurer avatar style](https://www.dicebear.com/styles/adventurer/) is a remix by Lisa Wischofsky, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
