import { io, type Socket } from 'socket.io-client';
import type {
  Ack,
  ClientState,
  ClientToServerEvents,
  ServerToClientEvents,
  Session,
} from './shared/types';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const SESSION_KEY = 'passport.session';

export class GameClient {
  state = $state<ClientState | null>(null);
  connected = $state(false);
  restoring = $state(false);
  pending = $state(false);
  error = $state('');
  notice = $state('');
  clockOffset = $state(0);
  private socket: GameSocket | null = null;
  private session: Session | null = null;
  private hadConnection = false;
  private connectionEpoch = 0;
  private wasReplaced = false;

  connect() {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (stored) this.session = JSON.parse(stored) as Session;
    } catch {
      this.session = null;
    }
    this.restoring = Boolean(this.session);
    // A relative endpoint keeps local, LAN, and tunnel players on the page's origin.
    this.socket = io({
      path: '/socket.io',
      autoConnect: false,
      reconnection: true,
      transports: ['websocket', 'polling'],
      tryAllTransports: true,
    });
    this.socket.on('room:state', (state) => {
      this.clockOffset = state.serverNow - Date.now();
      this.state = state;
    });
    this.socket.on('connect', async () => {
      this.connected = true;
      if (this.session) {
        this.restoring = true;
        const response = await this.request((socket) =>
          socket.timeout(8000).emitWithAck('room:resume', this.session!),
        );
        if (response?.ok) this.notice = 'You’re back. Your place in the room is saved.';
        else if (response && !response.ok) this.clearSession();
        this.restoring = false;
      } else if (this.hadConnection) this.notice = 'Connection restored.';
      this.hadConnection = true;
    });
    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      this.connectionEpoch += 1;
      this.pending = false;
      if (reason === 'io server disconnect' && this.wasReplaced) {
        this.wasReplaced = false;
        this.socket?.connect();
      }
    });
    this.socket.on('connect_error', () => {
      this.connected = false;
    });
    this.socket.on('room:replaced', () => {
      this.wasReplaced = true;
      this.clearSession();
      this.error =
        'This player session was opened in another tab. Join with a new name to play here.';
    });
    this.socket.connect();
  }

  destroy() {
    this.socket?.disconnect();
  }

  private clearSession() {
    this.session = null;
    this.state = null;
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* In-memory sessions still work when storage is unavailable. */
    }
  }

  private async request(send: (socket: GameSocket) => Promise<Ack>): Promise<Ack | null> {
    if (!this.socket?.connected) {
      this.error = 'Connecting to the game server. Please try again in a moment.';
      return null;
    }
    if (this.pending) return null;
    this.pending = true;
    const epoch = this.connectionEpoch;
    this.error = '';
    try {
      const response = await send(this.socket);
      if (epoch !== this.connectionEpoch) return null;
      if (!response.ok) this.error = response.error;
      else if (response.session) {
        this.session = response.session;
        try {
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(response.session));
        } catch {
          this.notice = 'Browser storage is unavailable. Keep this tab open to stay in the room.';
        }
      }
      return response;
    } catch {
      if (epoch !== this.connectionEpoch) return null;
      this.error = 'The server did not respond. Check your connection and try again.';
      return null;
    } finally {
      if (epoch === this.connectionEpoch) this.pending = false;
    }
  }

  create(displayName: string) {
    this.notice = '';
    return this.request((s) => s.timeout(8000).emitWithAck('room:create', { displayName }));
  }
  join(displayName: string, roomCode: string) {
    this.notice = '';
    return this.request((s) => s.timeout(8000).emitWithAck('room:join', { displayName, roomCode }));
  }
  async leave() {
    const response = await this.request((s) => s.timeout(8000).emitWithAck('room:leave', {}));
    if (response?.ok) {
      this.clearSession();
      this.notice = '';
    }
  }
  setTestMode(enabled: boolean) {
    if (!this.state) return;
    const payload = { roundNumber: this.state.roundNumber, enabled };
    return this.request((s) => s.timeout(8000).emitWithAck('room:test-mode', payload));
  }
  action(event: 'game:start' | 'game:next' | 'game:ready' | 'game:start-vote') {
    if (!this.state) return;
    const payload = { roundNumber: this.state.roundNumber };
    return this.request((s) => s.timeout(8000).emitWithAck(event, payload));
  }
  vote(targetId: string) {
    if (!this.state) return;
    const payload = { roundNumber: this.state.roundNumber, targetId };
    return this.request((s) => s.timeout(8000).emitWithAck('game:vote', payload));
  }
  guess(countryId: string) {
    if (!this.state) return;
    const payload = { roundNumber: this.state.roundNumber, countryId };
    return this.request((s) => s.timeout(8000).emitWithAck('game:guess', payload));
  }
}
