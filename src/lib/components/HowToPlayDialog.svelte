<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import PassportStamp from './PassportStamp.svelte';

  let { ondismiss }: { ondismiss: () => void } = $props();
  let dialog: HTMLDialogElement;
  let previousFocus: HTMLElement | null = null;
  let previousOverflow = '';

  onMount(() => {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.documentElement.style.overflow = previousOverflow;
      void tick().then(() => {
        const target =
          previousFocus?.isConnected &&
          previousFocus.matches('button:not(:disabled), input:not(:disabled), [tabindex="0"]')
            ? previousFocus
            : document.querySelector<HTMLElement>('[aria-label="How to play"]:not(:disabled)');
        target?.focus({ preventScroll: true });
      });
    };
  });

  function dismiss() {
    ondismiss();
  }

  function keepFocus(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;
    const controls = [
      ...dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]',
      ),
    ].filter((element) => element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) return;
    if (
      event.shiftKey &&
      (document.activeElement === first || !dialog.contains(document.activeElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || !dialog.contains(document.activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<dialog
  bind:this={dialog}
  class="how-to-play-dialog"
  aria-labelledby="how-to-play-dialog-title"
  aria-describedby="how-to-play-dialog-intro"
  onkeydown={keepFocus}
  oncancel={(event) => {
    event.preventDefault();
    dismiss();
  }}
>
  <div class="instruction-insert">
    <header class="instruction-header">
      <span class="instruction-emblem"><Icon name="globe" size={28} /></span>
      <div>
        <span class="passport-field-label">TRAVEL BRIEFING</span>
        <h1 id="how-to-play-dialog-title">HOW TO PLAY</h1>
      </div>
      <PassportStamp text="READ ME" variant="red" rotation={5} size="small" />
    </header>
    <p id="how-to-play-dialog-intro" class="instruction-intro">
      Everyone knows the country except one player.
    </p>
    <ol class="instruction-steps">
      <li>
        <span>1</span>
        <div>
          <h2>CHECK YOUR PASSPORT</h2>
          <p>Travelers see the country. The Tourist sees nothing.</p>
        </div>
      </li>
      <li>
        <span>2</span>
        <div>
          <h2>ASK QUESTIONS</h2>
          <p>Ask about the country without saying it directly.</p>
        </div>
      </li>
      <li>
        <span>3</span>
        <div>
          <h2>BLEND IN</h2>
          <p>The Tourist listens, bluffs and tries to work out the country.</p>
        </div>
      </li>
      <li>
        <span>4</span>
        <div>
          <h2>VOTE</h2>
          <p>Everyone votes for who they think the Tourist is.</p>
        </div>
      </li>
      <li>
        <span>5</span>
        <div>
          <h2>FINAL CHANCE</h2>
          <p>A caught Tourist gets one final country guess.</p>
        </div>
      </li>
    </ol>
    <footer class="instruction-action">
      <Button onclick={dismiss} class="full-width"
        >GOT IT - LET'S PLAY <Icon name="arrow" size={22} /></Button
      >
    </footer>
  </div>
</dialog>
