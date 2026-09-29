<script lang="ts">
  import { onMount } from 'svelte';
  import { GameClient } from '$lib/client.svelte';
  import { PassportProfile } from '$lib/profile.svelte';
  import PassportShell from '$lib/components/PassportShell.svelte';
  import Home from '$lib/components/Home.svelte';
  import GameRoom from '$lib/components/GameRoom.svelte';
  import HowToPlayDialog from '$lib/components/HowToPlayDialog.svelte';
  const game = new GameClient();
  const profile = new PassportProfile();
  onMount(() => {
    profile.load();
    game.connect();
    return () => game.destroy();
  });
  $effect(() => {
    if (profile.loaded) profile.save();
  });
  $effect(() => {
    if (game.state) {
      profile.opened = true;
      profile.guest = true;
    }
  });
</script>

<svelte:head
  ><title>PASSPORT - A Global Party Game</title><meta
    name="description"
    content="One country. One Tourist. Open your passport and play the geography bluffing game for 4-10 friends."
  /></svelte:head
>

<main class="app-shell">
  <div inert={profile.howToPlayOpen}>
    <PassportShell
      ready={profile.loaded}
      opened={profile.opened}
      onopen={() => (profile.opened = true)}
      onclose={() => (profile.opened = false)}
      onhelp={() => profile.showHowToPlay()}
      canHelp={profile.guest}
      canClose={!game.state}
    >
      <div class="notifications">
        {#if !game.connected}<div class="status-message" role="status">
            <span class="connection-dot offline"></span><span
              >{game.state
                ? 'Connection lost. Reconnecting - your place is saved.'
                : 'Connecting to the game server…'}</span
            >
          </div>{:else if game.restoring}<div class="status-message" role="status">
            Restoring your room…
          </div>{/if}
        {#if game.error}<div class="status-message error" role="alert">
            <span>{game.error}</span><button
              class="icon-button"
              aria-label="Dismiss error"
              onclick={() => (game.error = '')}>×</button
            >
          </div>{/if}
        {#if game.notice}<div class="status-message success" role="status">
            <span>{game.notice}</span><button
              class="icon-button"
              aria-label="Dismiss notice"
              onclick={() => (game.notice = '')}>×</button
            >
          </div>{/if}
      </div>
      {#if game.state}<GameRoom {game} {profile} room={game.state} />{:else}<Home
          {game}
          {profile}
        />{/if}
    </PassportShell>
  </div>
  {#if profile.howToPlayOpen}
    <HowToPlayDialog ondismiss={() => profile.dismissHowToPlay()} />
  {/if}
</main>
