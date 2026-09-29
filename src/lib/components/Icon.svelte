<script lang="ts">
  let {
    name = 'globe',
    size = 24,
  }: {
    name?: 'globe' | 'arrow' | 'check' | 'eye' | 'people' | 'copy' | 'compass' | 'lock';
    size?: number;
  } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.6"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if name === 'globe'}
    <circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path
      d="M3 12h18M5 6.5h14M5 17.5h14"
    />
  {:else if name === 'arrow'}<path d="M4 12h16m-6-6 6 6-6 6" />
  {:else if name === 'check'}<path d="m5 12 4 4L19 6" />
  {:else if name === 'eye'}<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" /><circle
      cx="12"
      cy="12"
      r="3"
    />
  {:else if name === 'people'}<circle cx="9" cy="8" r="3" /><path
      d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"
    />
  {:else if name === 'copy'}<rect x="8" y="8" width="12" height="13" rx="2" /><path
      d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"
    />
  {:else if name === 'compass'}<circle cx="12" cy="12" r="9" /><path d="m16 8-2 6-6 2 2-6 6-2Z" />
  {:else}<rect x="5" y="10" width="14" height="11" rx="2" /><path
      d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"
    />{/if}
</svg>
