<script lang="ts">
  import type { PublicPlayer } from '$lib/shared/types';
  import PassportPhoto from './PassportPhoto.svelte';
  let {
    player,
    youId,
    hostId,
  }: { player: PublicPlayer; youId: string; hostId: string; index: number; status?: string } =
    $props();
  const checkpoint = $derived(
    !player.connected
      ? 'DELAYED'
      : player.hasVoted
        ? 'FLAGGED'
        : player.ready
          ? 'CLEARED'
          : 'PROCESSING',
  );
</script>

<div class="player-card" class:disconnected={!player.connected}>
  <PassportPhoto seed={player.id} size="small" />
  <div class="player-details">
    <span class="player-name" dir="auto">{player.displayName}</span><span class="player-meta"
      >{player.id === youId ? 'You' : player.id === hostId ? 'Host' : 'Crew'}{player.id === youId &&
      player.id === hostId
        ? ' · Host'
        : ''}</span
    >
  </div>
  <span
    class="player-status"
    class:status-cleared={checkpoint === 'CLEARED'}
    class:status-flagged={checkpoint === 'FLAGGED'}
    class:status-delayed={checkpoint === 'DELAYED'}
    aria-label={!player.connected ? 'Disconnected' : checkpoint}>{checkpoint}</span
  >
</div>
