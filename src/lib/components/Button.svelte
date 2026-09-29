<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    children,
    onclick,
    disabled = false,
    variant = 'primary',
    type = 'button',
    class: className = '',
  }: {
    children: Snippet;
    onclick?: () => void;
    disabled?: boolean;
    variant?: 'primary' | 'secondary' | 'quiet';
    type?: 'button' | 'submit';
    class?: string;
  } = $props();
</script>

<button {type} {onclick} {disabled} class="button {variant} {className}"
  >{@render children()}</button
>
