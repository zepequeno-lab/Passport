<script lang="ts">
  import type { Snippet } from 'svelte';
  import PassportPage from './PassportPage.svelte';
  let {
    left,
    right,
    phaseKey = 'home',
    leftLabel = 'Your identity',
    rightLabel = 'Game lobby',
  }: {
    left: Snippet;
    right: Snippet;
    phaseKey?: string;
    leftLabel?: string;
    rightLabel?: string;
  } = $props();
</script>

<div class="passport-spread" data-testid="passport-spread">
  <PassportPage side="left" label={leftLabel}>{@render left()}</PassportPage>
  <PassportPage side="right" label={rightLabel}>{@render right()}</PassportPage>
  <div class="passport-spine" aria-hidden="true"></div>
  {#key phaseKey}<div class="paper-turn" aria-hidden="true"><span></span></div>{/key}
</div>
