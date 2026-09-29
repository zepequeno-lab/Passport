<script lang="ts">
  import type { GameClient } from '$lib/client.svelte';
  import type { ClientState } from '$lib/shared/types';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import PassportStamp from './PassportStamp.svelte';
  let { game, room }: { game: GameClient; room: ClientState } = $props();
  const me = $derived(room.players.find((player) => player.id === room.youId));
</script>

<div class="phase-heading">
  <span class="eyebrow">Confidential travel document</span>
  <h1>{room.role === 'TOURIST' ? 'You are the Tourist' : 'Your destination'}</h1>
  <p class="muted">A little discretion goes a long way.</p>
</div>
<div class="secret-card" class:tourist={room.role === 'TOURIST'}>
  {#if room.role === 'TOURIST'}
    <div class="stamp-slot">
      <PassportStamp text="PASSPORT ERROR" variant="red" rotation={-4} />
    </div>
    <span class="eyebrow">Destination missing</span>
    <h2>Act like you belong.</h2>
    <p>You don’t know the country.<br />Listen. Blend in. Figure it out.</p>
  {:else}
    <span class="eyebrow">Destination</span>
    <h2 class="country-name" data-testid="secret-country">{room.country?.name}</h2>
    <div class="stamp-slot">
      <PassportStamp text="KEEP IT SECRET" variant="blue" rotation={-3} />
    </div>
    <p>Everyone knows it except the Tourist.<br />Find the person traveling on a bluff.</p>
  {/if}
</div>
<div class="phase-actions">
  <Button
    onclick={() => game.action('game:ready')}
    disabled={me?.ready || game.pending || !game.connected}
    >{#if me?.ready}<Icon name="check" size={20} /> You’re ready{:else}I’m ready <Icon
        name="arrow"
        size={20}
      />{/if}</Button
  >
  <p class="muted">
    {room.players.filter((p) => p.connected && p.ready).length} of {room.players.filter(
      (p) => p.connected,
    ).length} cleared for departure. Discussion starts when everyone is ready, or when time is up.
  </p>
</div>
