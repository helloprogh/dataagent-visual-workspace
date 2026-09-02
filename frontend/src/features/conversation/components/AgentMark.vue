<script setup lang="ts">
withDefaults(defineProps<{ size?: 'default' | 'compact' }>(), { size: 'default' })
</script>

<template>
  <div class="agent-mark" :class="`agent-mark--${size}`" aria-hidden="true">
    <svg viewBox="0 0 48 48">
      <path class="agent-mark__frame" d="M11.5 16 24 8.5 36.5 16v16L24 39.5 11.5 32V16Z" />
      <path class="agent-mark__signal" d="m16 27 8-11 8 11-8 5-8-5Z" />
      <circle class="agent-mark__core" cx="24" cy="24" r="3.25" />
    </svg>
  </div>
</template>

<style scoped>
.agent-mark { display: grid; width: 3rem; height: 3rem; place-items: center; border: 0.0625rem solid color-mix(in srgb, var(--da-accent-primary) 32%, var(--da-border)); border-radius: var(--da-radius-lg); background: radial-gradient(circle at 65% 20%, var(--da-brand-orange-soft), transparent 44%), linear-gradient(145deg, var(--da-surface-3), var(--da-surface-1)); box-shadow: inset 0 0.0625rem rgb(255 255 255 / 7%), 0 0.75rem 2rem var(--da-brand-glow); }
.agent-mark svg { width: 2rem; height: 2rem; }
.agent-mark--compact { width: 2rem; height: 2rem; border-radius: var(--da-radius-md); box-shadow: inset 0 0.0625rem rgb(255 255 255 / 7%), 0 0.375rem 1rem var(--da-brand-glow); }
.agent-mark--compact svg { width: 1.35rem; height: 1.35rem; }
.agent-mark__frame { fill: none; stroke: var(--da-accent-primary); stroke-width: 1.5; }
.agent-mark__signal { fill: color-mix(in srgb, var(--da-accent-orange) 20%, transparent); stroke: var(--da-accent-orange); stroke-linejoin: round; stroke-width: 1.5; }
.agent-mark__core { fill: var(--da-text-emphasis); filter: drop-shadow(0 0 0.25rem var(--da-brand-cyan)); }
</style>
