<script lang="ts">
  import type { ClientState } from '$lib/shared/types';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import PassportStamp from './PassportStamp.svelte';
  let { room }: { room: ClientState } = $props();
  let revealed = $state(false);
</script>

<section class="private-destination" aria-label="Your private role">
  <div class="printed-heading">
    <Icon name="lock" size={20} />
    <h2>CLASSIFIED</h2>
  </div>
  {#if room.role === 'TOURIST'}
    <PassportStamp text="PASSPORT ERROR" variant="red" rotation={-3} />
    <h3>You are the Tourist</h3>
    <p>Your destination is a mystery.<br />Listen. Blend in. Figure it out.</p>
  {:else}
    <span class="passport-field-label">YOUR SECRET DESTINATION</span>
    <strong class="private-country">{revealed ? room.country?.name : 'TOP SECRET'}</strong>
    <Button variant="secondary" onclick={() => (revealed = !revealed)}
      ><Icon name="eye" size={22} />{revealed ? 'Hide country' : 'Reveal country'}</Button
    >
    <p class="field-hint">For your eyes only. Keep it off the record!</p>
  {/if}
</section>
