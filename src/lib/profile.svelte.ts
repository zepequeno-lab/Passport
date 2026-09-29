const PROFILE_KEY = 'passport.identity';

export class PassportProfile {
  name = $state('');
  seed = $state('passport-traveler');
  guest = $state(false);
  opened = $state(false);
  loaded = $state(false);
  howToPlayOpen = $state(false);

  load() {
    try {
      const raw = sessionStorage.getItem(PROFILE_KEY);
      const saved: unknown = raw ? JSON.parse(raw) : null;
      if (saved && typeof saved === 'object') {
        const data = saved as Record<string, unknown>;
        if (typeof data.name === 'string') this.name = data.name.slice(0, 24);
        if (typeof data.seed === 'string') this.seed = data.seed;
        this.guest = data.guest === true;
        this.opened = data.opened === true;
      } else {
        this.name = `Traveler${Math.floor(Math.random() * 900) + 100}`;
        this.seed = crypto.randomUUID();
      }
    } catch {
      this.name = 'Traveler123';
    }
    this.loaded = true;
  }

  save() {
    const data = { name: this.name, seed: this.seed, guest: this.guest, opened: this.opened };
    try {
      sessionStorage.setItem(PROFILE_KEY, JSON.stringify(data));
    } catch {
      /* The current tab still works without storage. */
    }
  }

  changeAvatar() {
    this.seed = crypto.randomUUID();
  }

  completeIdentity(kind: 'guest' | 'authenticated') {
    // Future login success calls this after establishing its authenticated identity.
    if (kind === 'guest') this.guest = true;
    this.howToPlayOpen = true;
  }

  showHowToPlay() {
    this.howToPlayOpen = true;
  }

  dismissHowToPlay() {
    this.howToPlayOpen = false;
  }
}
