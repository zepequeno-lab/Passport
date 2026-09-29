<script lang="ts">
  import type { GameClient } from '$lib/client.svelte';
  import type { ClientState } from '$lib/shared/types';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import PassportPhoto from './PassportPhoto.svelte';
  import PassportStamp from './PassportStamp.svelte';
  let { game, room }: { game: GameClient; room: ClientState } = $props();
  let selected = $state('');
  const me = $derived(room.players.find((p) => p.id === room.youId));
  const choices = $derived(room.players.filter((p) => p.active && p.id !== room.youId));
</script>

<div class="phase-heading">
  <span class="eyebrow">Customs check</span>
  <h1>Who has the fake passport?</h1>
  <p class="muted">Choose one player. Your vote is private until the reveal.</p>
</div>
{#if me?.hasVoted}
  <div class="waiting-card">
    <div class="stamp-slot">
      <PassportStamp text="PASSPORT FLAGGED" variant="gold" rotation={-3} />
    </div>
    <h2>Vote submitted</h2>
    <p>Your report is filed.<br />Waiting for the rest of the crew.</p>
  </div>
{:else}
  <div class="vote-grid">
    {#each choices as player}<button
        class="vote-option"
        class:selected={selected === player.id}
        onclick={() => (selected = player.id)}
        aria-label="Select {player.displayName}"
        aria-pressed={selected === player.id}
        ><PassportPhoto seed={player.id} size="small" /><span class="vote-player-details"
          ><span class="player-name" dir="auto">{player.displayName}</span
          >{#if !player.connected}<span class="player-meta">Connection delayed</span>{/if}</span
        ><span class="selection-indicator" aria-hidden="true"
          >{#if selected === player.id}<Icon name="check" size={16} />{/if}</span
        ></button
      >{/each}
  </div>
  <div class="phase-actions">
    <Button
      onclick={() => game.vote(selected)}
      disabled={!choices.some((p) => p.id === selected) || game.pending || !game.connected}
      >Flag passport <Icon name="arrow" size={20} /></Button
    >
    <p class="muted">You can change your choice until you submit.</p>
  </div>
{/if}
<p class="rule-note">
  A tie means the Tourist survives. Unsubmitted votes are skipped when time runs out.
</p>
