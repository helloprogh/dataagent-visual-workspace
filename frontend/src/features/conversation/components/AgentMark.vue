<template>
  <div class="agent-mark" aria-hidden="true">
    <svg viewBox="0 0 48 48">
      <path d="M12 16.5 24 9l12 7.5v15L24 39l-12-7.5v-15Z" fill="none" stroke="currentColor" stroke-width="1.5" />
      <circle cx="24" cy="24" r="4.5" fill="currentColor" />
      <path d="M24 13.5v6M24 28.5v6M14.5 19l5.2 3M28.3 26l5.2 3M33.5 19l-5.2 3M19.7 26l-5.2 3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5" />
    </svg>
  </div>
</template>

<style scoped>
.agent-mark { display: grid; width: 3rem; height: 3rem; place-items: center; color: var(--da-accent-orange); border: 0.0625rem solid var(--da-border-strong); border-radius: var(--da-radius-lg); background: var(--da-surface-2); box-shadow: var(--da-shadow-soft); }
.agent-mark svg { width: 2rem; height: 2rem; }
</style>
