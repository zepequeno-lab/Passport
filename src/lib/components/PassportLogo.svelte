<script lang="ts">
  import Icon from './Icon.svelte';
  let { compact = false }: { compact?: boolean } = $props();
</script>

<div class="passport-logo" class:compact>
  <div><Icon name="globe" size={42} /><span>PASSPORT</span></div>
  <p>A GLOBAL PARTY GAME</p>
</div>
