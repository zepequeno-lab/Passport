<script lang="ts">
  import { onMount, onDestroy, type Snippet } from 'svelte';
  import PassportCover from './PassportCover.svelte';
  import Icon from './Icon.svelte';
  let {
    children,
    opened,
    onopen,
    onclose,
    onhelp,
    canHelp = false,
    canClose = true,
    ready = false,
  }: {
    children: Snippet;
    opened: boolean;
    onopen: () => void;
    onclose: () => void;
    onhelp: () => void;
    canHelp?: boolean;
    canClose?: boolean;
    ready?: boolean;
  } = $props();
  let stage = $state<'closed' | 'opening' | 'open' | 'closing'>('closed');
  let reducedMotion = $state(false);
  let motionTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (opened && stage === 'closed') stage = 'open';
  });
  onMount(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = preference.matches;
    const changed = () => (reducedMotion = preference.matches);
    preference.addEventListener('change', changed);
    return () => preference.removeEventListener('change', changed);
  });
  onDestroy(() => clearTimeout(motionTimer));
  function open() {
    if (stage !== 'closed' || !ready) return;
    stage = 'opening';
    motionTimer = setTimeout(
      () => {
        stage = 'open';
        onopen();
      },
      reducedMotion ? 100 : 850,
    );
  }
  function close() {
    if (stage !== 'open') return;
    stage = 'closing';
    onclose();
    motionTimer = setTimeout(() => (stage = 'closed'), reducedMotion ? 100 : 750);
  }
</script>

<div class="travel-scene">
  <div class="scene-caption" aria-hidden="true">
    <Icon name="globe" size={20} /> BIG WORLD. SUSPICIOUS FRIENDS.
  </div>
  {#if stage === 'closed'}
    <PassportCover onopen={open} disabled={!ready} />
  {:else}
    <div
      class="passport-workspace"
      class:book-opening={stage === 'opening'}
      class:book-closing={stage === 'closing'}
      data-testid="passport-workspace"
      data-book-state={stage}
    >
      <div class="passport-topbar">
        <span><Icon name="compass" size={19} /> YOUR TICKET TO A GOOD TIME</span>
        <div class="passport-topbar-actions">
          {#if canHelp}<button
              class="passport-help"
              aria-label="How to play"
              onclick={onhelp}
              disabled={stage !== 'open'}>HOW TO PLAY</button
            >{/if}{#if canClose}<button
              class="close-passport"
              onclick={close}
              disabled={stage !== 'open'}><Icon name="arrow" size={18} /> Close passport</button
            >{/if}
        </div>
      </div>
      <div class="book-body">
        <div class="book-interior" inert={stage !== 'open'}>{@render children()}</div>
        {#if stage === 'opening' || stage === 'closing'}<div
            class="moving-cover"
            aria-hidden="true"
          >
            <div>
              <span>PASSPORT</span><img
                src="/passport-emblem.svg"
                alt=""
                width="180"
                height="160"
              /><small>A GLOBAL PARTY GAME</small>
            </div>
          </div>{/if}
      </div>
    </div>
  {/if}
  <footer class="travel-footer">
    <span>EXPLORE. GUESS. CONNECT.</span><span
      >MADE FOR GOOD COMPANY <Icon name="globe" size={17} /></span
    >
  </footer>
</div>
