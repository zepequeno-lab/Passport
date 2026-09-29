<script lang="ts">
  let {
    seed,
    size = 'medium',
    alt = 'Cartoon traveler avatar',
  }: {
    seed: string;
    size?: 'small' | 'medium' | 'large';
    alt?: string;
  } = $props();
  let failedUrl = $state<string | null>(null);
  const avatar = $derived(
    `https://api.dicebear.com/10.x/adventurer/svg?seed=${encodeURIComponent(seed)}`,
  );
  const fallback = $derived(failedUrl === avatar);
</script>

<span class="passport-photo photo-{size}">
  <img
    src={fallback ? '/avatar-fallback.svg' : avatar}
    alt={fallback ? `${alt} (offline illustration)` : alt}
    width="160"
    height="160"
    decoding="async"
    referrerpolicy="no-referrer"
    onerror={() => (failedUrl = avatar)}
  />
</span>
