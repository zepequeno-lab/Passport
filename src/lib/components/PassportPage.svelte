<script lang="ts">
  import type { Snippet } from 'svelte';
  let { children, side, label }: { children: Snippet; side: 'left' | 'right'; label: string } =
    $props();
</script>

<section class="passport-page page-{side}" aria-label={label}>
  <div class="page-content">{@render children()}</div>
  <div class="document-footer" aria-hidden="true">
    <span>P&lt;WORLD&lt;&lt;GOOD&lt;TIMES&lt;ONLY&lt;&lt;</span><span
      >{side === 'left' ? '01' : '02'}</span
    >
  </div>
</section>
