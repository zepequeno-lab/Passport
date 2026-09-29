import { describe, expect, it } from 'vitest';
import { PassportProfile } from '../../src/lib/profile.svelte.js';

describe('authenticated identity onboarding integration', () => {
  it('opens instructions after login completion without converting the identity to a guest', () => {
    const profile = new PassportProfile();
    profile.name = 'Returning traveler';
    profile.seed = 'existing-avatar';
    profile.opened = true;
    profile.loaded = true;

    expect(profile.howToPlayOpen).toBe(false);
    profile.completeIdentity('authenticated');
    expect(profile.howToPlayOpen).toBe(true);
    expect(profile.guest).toBe(false);
    expect(profile.name).toBe('Returning traveler');
    expect(profile.seed).toBe('existing-avatar');

    profile.dismissHowToPlay();
    expect(profile.howToPlayOpen).toBe(false);
    profile.showHowToPlay();
    expect(profile.howToPlayOpen).toBe(true);
    profile.dismissHowToPlay();
    profile.completeIdentity('authenticated');
    expect(profile.howToPlayOpen).toBe(true);
    expect(profile.guest).toBe(false);
  });
});
