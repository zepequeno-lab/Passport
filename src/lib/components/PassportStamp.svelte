<script lang="ts">
  let {
    text,
    variant = 'blue',
    rotation = -5,
    size = 'medium',
    animated = false,
  }: {
    text: string;
    variant?: 'blue' | 'red' | 'green' | 'gold';
    rotation?: number;
    size?: 'small' | 'medium' | 'large';
    animated?: boolean;
  } = $props();
</script>

<span
  class="passport-stamp stamp-{variant} stamp-{size}"
  class:stamp-impact={animated}
  style:--stamp-rotation="{rotation}deg"><span>{text}</span></span
>
