<script lang="ts">
  import type { GameClient } from '$lib/client.svelte';
  import type { PassportProfile } from '$lib/profile.svelte';
  import PassportSpread from './PassportSpread.svelte';
  import PassportIdentity from './PassportIdentity.svelte';
  import PassportStamp from './PassportStamp.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  let { game, profile }: { game: GameClient; profile: PassportProfile } = $props();
  let code = $state('');
  let mode = $state<'join' | 'create'>('join');
  const disabled = $derived(
    !profile.guest || !profile.name.trim() || game.pending || !game.connected,
  );
  function join(event: SubmitEvent) {
    event.preventDefault();
    if (!disabled && code.trim().length === 6)
      void game.join(profile.name.trim(), code.trim().toUpperCase());
  }
</script>

<PassportSpread>
  {#snippet left()}<PassportIdentity {profile} />{/snippet}
  {#snippet right()}
    <div class="lobby-title">
      <span class="icon-sticker"><Icon name="globe" size={34} /></span>
      <div>
        <h1>GAME LOBBY</h1>
        <p>Join a room or create your own!</p>
      </div>
    </div>
    <div class="room-tabs" role="tablist" aria-label="Room action">
      <button
        role="tab"
        aria-selected={mode === 'join'}
        aria-controls="join-panel"
        id="join-tab"
        onclick={() => (mode = 'join')}>JOIN A ROOM</button
      ><button
        role="tab"
        aria-selected={mode === 'create'}
        aria-controls="create-panel"
        id="create-tab"
        onclick={() => (mode = 'create')}>CREATE A ROOM</button
      >
    </div>
    {#if mode === 'join'}
      <div id="join-panel" role="tabpanel" aria-labelledby="join-tab" class="room-action-panel">
        <form onsubmit={join}>
          <div class="field">
            <label for="room-code" class="passport-field-label">GOT YOUR BOARDING CODE?</label>
            <div class="join-controls">
              <input
                id="room-code"
                aria-label="Room code"
                class="code-input"
                autocomplete="off"
                autocapitalize="characters"
                spellcheck="false"
                maxlength="6"
                placeholder="Enter room code…"
                bind:value={code}
                required
              /><Button
                type="submit"
                variant="secondary"
                disabled={disabled || code.trim().length !== 6}
                >Join room <Icon name="arrow" size={21} /></Button
              >
            </div>
          </div>
        </form>
        <p class="field-hint">
          {profile.guest
            ? 'Get the 6-character code from your host.'
            : 'Press Play as Guest to get your passport ready.'}
        </p>
      </div>
    {:else}
      <div id="create-panel" role="tabpanel" aria-labelledby="create-tab" class="room-action-panel">
        <p class="create-room-copy">Your room. Your friends. One very suspicious Tourist.</p>
        <Button
          variant="secondary"
          class="full-width"
          onclick={() => game.create(profile.name.trim())}
          {disabled}>Create room <Icon name="arrow" size={22} /></Button
        >
        <p class="field-hint">
          {profile.guest
            ? 'We’ll give you a private code to share.'
            : 'Press Play as Guest to get your passport ready.'}
        </p>
      </div>
    {/if}
    <section class="how-to-play" aria-labelledby="how-to-play-heading">
      <div class="printed-heading">
        <Icon name="compass" size={26} />
        <h2 id="how-to-play-heading">HOW TO PLAY</h2>
      </div>
      <ol>
        <li>
          <span class="instruction-number">1</span>
          <div>
            <h3>One country. One Tourist.</h3>
            <p>Everyone gets the destination. One of you gets a problem.</p>
          </div>
        </li>
        <li>
          <span class="instruction-number">2</span>
          <div>
            <h3>Talk your way through customs.</h3>
            <p>Ask sneaky questions. Blend in. Don’t give the country away!</p>
          </div>
        </li>
        <li>
          <span class="instruction-number">3</span>
          <div>
            <h3>Spot the fake passport.</h3>
            <p>Vote for the Tourist. Catch them, and they get one last guess.</p>
          </div>
        </li>
      </ol>
    </section>
    <div class="boarding-note">
      <Icon name="people" size={26} />
      <p>
        <strong>4-10 FRIENDS · ABOUT 5 MINUTES</strong><span
          >Bring your own voice call. We’ll bring the suspicion.</span
        >
      </p>
    </div>
    <div class="arrival-stamp">
      <PassportStamp text="ADVENTURE AWAITS" variant="blue" rotation={-3} size="small" />
    </div>
  {/snippet}
</PassportSpread>
