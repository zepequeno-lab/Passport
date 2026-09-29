<script lang="ts">
  import type { GameClient } from '$lib/client.svelte';
  import type { ClientState } from '$lib/shared/types';
  import { COUNTRIES } from '$lib/shared/countries';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import PassportStamp from './PassportStamp.svelte';
  let { game, room }: { game: GameClient; room: ClientState } = $props();
  let search = $state('');
  let selected = $state('');
  const choices = $derived(
    COUNTRIES.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase())),
  );
</script>

{#if room.role === 'TOURIST'}
  <div class="phase-heading">
    <span class="eyebrow">One last border crossing</span>
    <h1>Final chance.</h1>
    <p class="muted">Name the country and steal the win. You get one guess.</p>
  </div>
  <div class="field">
    <label for="country-search">Search countries</label><input
      id="country-search"
      type="search"
      placeholder="Find a country"
      bind:value={search}
      autocomplete="off"
    />
  </div>
  <div class="country-list" aria-label="Country choices">
    {#each choices as country}<button
        class="country-option"
        class:selected={selected === country.id}
        aria-pressed={selected === country.id}
        onclick={() => (selected = country.id)}
        >{country.name}{#if selected === country.id}<Icon name="check" size={18} />{/if}</button
      >{:else}<p class="muted empty-search">No countries match. Try another search.</p>{/each}
  </div>
  <div class="phase-actions">
    <Button
      onclick={() => game.guess(selected)}
      disabled={!selected || game.pending || !game.connected}
      >Submit guess <Icon name="arrow" size={20} /></Button
    >
    <p class="muted">
      {selected
        ? `Your guess: ${COUNTRIES.find((c) => c.id === selected)?.name}`
        : 'Choose a country from the list.'}
    </p>
  </div>
{:else}
  <div class="phase-heading">
    <span class="eyebrow">Passport under review</span>
    <h1>The Tourist has one last guess.</h1>
    <p class="muted">You found them. But it’s not over yet.</p>
  </div>
  <div class="waiting-card">
    <div class="stamp-slot"><PassportStamp text="UNDER REVIEW" variant="blue" rotation={-4} /></div>
    <h2>Hold at customs.</h2>
    <p>Waiting for the Tourist’s final guess…<br />If they name the country, they steal the win.</p>
  </div>
{/if}
