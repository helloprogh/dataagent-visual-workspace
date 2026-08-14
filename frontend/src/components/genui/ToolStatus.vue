<script setup lang="ts">
defineProps<{ name: string; status: 'inProgress'|'executing'|'complete'; parameters?: Record<string, unknown>; result?: string }>()
</script>
<template><div class="tool-status"><span class="dot" :class="status"></span><b>{{ name }}</b><span class="muted">{{ status }}</span></div></template>
