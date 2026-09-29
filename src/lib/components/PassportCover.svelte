<script lang="ts">
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  let { onopen, disabled = false }: { onopen: () => void; disabled?: boolean } = $props();
</script>

<div class="cover-scene">
  <div class="passport-cover" data-testid="passport-cover">
    <div class="cover-border">
      <div class="cover-heading">
        <span class="cover-tiny">REPUBLIC OF GOOD TIMES</span>
        <h1>PASSPORT</h1>
        <span>A GLOBAL PARTY GAME</span>
      </div>
      <img
        class="cover-emblem"
        src="/passport-emblem.svg"
        alt="Original globe and travel emblem"
        width="200"
        height="160"
      />
      <div class="cover-bottom">
        <span>EVERYONE KNOWS THE DESTINATION.</span><strong>Except one of you.</strong><Icon
          name="globe"
          size={26}
        />
      </div>
    </div>
  </div>
  <Button onclick={onopen} {disabled} class="open-passport"
    >Open passport <Icon name="arrow" size={24} /></Button
  >
  <p class="cover-invitation">4-10 friends. One secret. A world of suspicion.</p>
</div>
