<script lang="ts">
  import { onMount } from 'svelte';
  let {
    deadline,
    clockOffset,
    label = 'Remaining',
  }: { deadline: number | null; clockOffset: number; label?: string } = $props();
  let now = $state(Date.now());
  $effect(() => {
    if (deadline !== null && Number.isFinite(clockOffset)) now = Date.now();
  });
  onMount(() => {
    const id = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(id);
  });
  const seconds = $derived(Math.max(0, Math.ceil(((deadline ?? now) - now - clockOffset) / 1000)));
</script>

{#if deadline}
  <div
    class="timer"
    class:urgent={seconds <= 15}
    aria-label="{label}: {Math.floor(seconds / 60)} minutes {seconds % 60} seconds"
  >
    <span class="eyebrow">{label}</span><span class="timer-value"
      >{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span
    >
  </div>
{/if}
