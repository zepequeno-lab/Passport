<script lang="ts">
  import type { GameClient } from '$lib/client.svelte';
  import type { ClientState } from '$lib/shared/types';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  let { game, room }: { game: GameClient; room: ClientState } = $props();
</script>

<div class="phase-heading">
  <span class="eyebrow">A routine border interview</span>
  <h1>Borderline suspicious.</h1>
  <p class="muted">Talk in person or on your favorite voice call.</p>
</div>
<div class="discussion-prompt">
  <Icon name="people" size={32} />
  <h2>“What would you pack?”</h2>
  <p>
    Ask something only a fellow traveler would know. Sound convincing. Keep the country off the
    record.
  </p>
</div>
<div class="phase-actions">
  {#if room.hostPlayerId === room.youId}<Button
      onclick={() => game.action('game:start-vote')}
      disabled={game.pending || !game.connected}>Start vote <Icon name="arrow" size={20} /></Button
    >
    <p class="muted">Someone’s story not adding up? Open the customs check early.</p>{:else}<p
      class="waiting-note"
    >
      The host can start the vote early.
    </p>{/if}
  <p class="field-hint">Voting begins automatically when the timer ends.</p>
</div>
