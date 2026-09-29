<script lang="ts">
  import type { PassportProfile } from '$lib/profile.svelte';
  import type { ClientState } from '$lib/shared/types';
  import PassportLogo from './PassportLogo.svelte';
  import PassportPhoto from './PassportPhoto.svelte';
  import PassportStamp from './PassportStamp.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  let { profile, room }: { profile: PassportProfile; room?: ClientState } = $props();
  let loginNotice = $state(false);
  const me = $derived(room?.players.find((p) => p.id === room.youId));
  function playGuest() {
    if (!profile.name.trim()) profile.name = 'Traveler123';
    profile.name = profile.name.trim();
    profile.completeIdentity('guest');
  }
</script>

<PassportLogo compact={Boolean(room)} />
<div class="identity-record" class:in-room={Boolean(room)}>
  <div class="identity-photo">
    <PassportPhoto seed={profile.seed} size="large" />{#if !room}<button
        class="change-avatar"
        onclick={() => profile.changeAvatar()}
        aria-label="Change avatar"><Icon name="compass" size={18} /> New look</button
      >{:else}<PassportStamp text="GUEST" size="small" rotation={-5} />{/if}
  </div>
  <div class="identity-fields">
    <div class="field">
      <label class="passport-field-label" for={room ? undefined : 'player-name'}>PLAYER NAME</label
      >{#if room}<h2 class="identity-name" dir="auto">{me?.displayName}</h2>{:else}<input
          id="player-name"
          aria-label="Your name"
          maxlength="24"
          autocomplete="nickname"
          bind:value={profile.name}
          placeholder="Your traveler name"
        />{/if}
    </div>
    <div class="identity-detail">
      <span class="passport-field-label">STATUS</span><strong
        ><span class="guest-dot"></span> Playing as Guest</strong
      >
    </div>
    <div class="identity-detail">
      <span class="passport-field-label">LANGUAGE</span><span
        ><Icon name="globe" size={19} /> English</span
      >
    </div>
  </div>
</div>
{#if !room}
  <div class="identity-stamps">
    <PassportStamp text="GUEST" variant="red" rotation={-9} /><span class="identity-line"
      >NO VISA REQUIRED.<br />A GOOD ALIBI HELPS.</span
    >
  </div>
  <div class="guest-actions">
    <Button onclick={playGuest} disabled={profile.guest} class="full-width"
      >{#if profile.guest}<Icon name="check" size={23} /> Guest passport ready{:else}<span
          aria-hidden="true">▶</span
        > Play as Guest{/if}</Button
    >
    <p>
      {profile.guest
        ? 'You’re cleared! Join a room or make your own.'
        : 'Jump in and start playing!'}
    </p>
    <button class="login-button" onclick={() => (loginNotice = !loginNotice)}
      >LOGIN <span>COMING SOON</span></button
    >
    <p class="login-copy">Save your progress later</p>
    {#if loginNotice}<p class="login-notice" role="status">
        Login coming soon. Your guest passport is all you need for now.
      </p>{/if}
  </div>
  <div class="souvenir-stamps" aria-label="Passport stamps">
    <PassportStamp text={'CLEARED\nFOR FUN'} variant="green" rotation={-8} size="large" />
    <div class="round-stamp">
      <Icon name="globe" size={25} /><span>EXPLORE<br />GUESS · CONNECT</span>
    </div>
  </div>
{:else}
  <div class="travel-record">
    <div><span class="passport-field-label">DOCUMENT</span><strong>GUEST PASSPORT</strong></div>
    <div>
      <span class="passport-field-label">ROUND</span><strong
        >{String(room.roundNumber || 1).padStart(2, '0')}</strong
      >
    </div>
  </div>
{/if}
