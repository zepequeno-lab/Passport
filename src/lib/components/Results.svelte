<script lang="ts">
  import type { GameClient } from '$lib/client.svelte';
  import type { ClientState } from '$lib/shared/types';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import PassportPhoto from './PassportPhoto.svelte';
  import PassportStamp from './PassportStamp.svelte';
  let { game, room }: { game: GameClient; room: ClientState } = $props();
  function name(id: string) {
    return room.results?.roster.find((p) => p.id === id)?.displayName ?? 'Departed player';
  }
</script>

{#if room.results}
  <div class="phase-heading">
    <span class="eyebrow">The official verdict</span>
    <h1>{room.results.winner === 'TOURIST' ? 'Tourist wins.' : 'Travelers win.'}</h1>
    <p class="muted">{room.results.reason}</p>
  </div>
  <div class="result-stamp">
    <PassportStamp
      text={room.results.winner === 'TRAVELERS' ? 'ENTRY APPROVED' : 'FORGED'}
      variant={room.results.winner === 'TRAVELERS' ? 'green' : 'red'}
      rotation={room.results.winner === 'TRAVELERS' ? -4 : 4}
      size="large"
      animated
    />
  </div>
  <div class="result-facts">
    <div>
      <span class="eyebrow">The country</span>
      <h2>{room.results.country.name}</h2>
    </div>
    <div class="result-tourist">
      <PassportPhoto seed={room.results.touristPlayerId} size="medium" />
      <div>
        <span class="eyebrow">The Tourist</span>
        <h2 dir="auto">{name(room.results.touristPlayerId)}</h2>
      </div>
    </div>
    {#if room.results.touristGuess}<div class="guess-result">
        <span class="eyebrow">The Tourist guessed</span><strong
          >{room.results.touristGuess.name}</strong
        ><span class="result-tag"
          >{room.results.touristGuess.id === room.results.country.id
            ? 'Correct guess'
            : 'Wrong guess'}</span
        >
      </div>{/if}
  </div>
  <section class="vote-results" aria-label="Vote results">
    <h3>Customs reports</h3>
    <div class="vote-records">
      {#each room.results.roster as player}<div class="vote-record">
          <span dir="auto">{player.displayName}</span><span aria-hidden="true">→</span><strong
            dir="auto"
            >{room.results.votes.find((v) => v.voterId === player.id)
              ? name(room.results.votes.find((v) => v.voterId === player.id)!.targetId)
              : 'No vote'}</strong
          >
        </div>{/each}
    </div>
  </section>
  <div class="phase-actions">
    {#if room.hostPlayerId === room.youId}<Button
        onclick={() => game.action('game:next')}
        disabled={room.players.filter((p) => p.connected).length < room.minPlayers ||
          game.pending ||
          !game.connected}>Next round <Icon name="arrow" size={20} /></Button
      >
      <p class="muted">
        {room.players.filter((p) => p.connected).length < room.minPlayers
          ? `You need at least ${room.minPlayers} connected players for another round.`
          : 'Same crew. New country. A fresh alibi.'}
      </p>{:else}<p class="waiting-note">Waiting for the host to start the next round.</p>{/if}
  </div>
{/if}
