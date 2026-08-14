<script setup lang="ts">
defineProps<{ title?: string; sql?: string; dialect?: string; durationMs?: number }>()
</script>
<template><div class="gen-card"><div class="gen-title-row"><span class="gen-title">{{ title || '生成 SQL' }}</span><el-tag size="small">{{ dialect || 'SQL' }}</el-tag></div><pre class="sql"><code>{{ sql || '--' }}</code></pre><div v-if="durationMs !== undefined" class="muted">执行耗时 {{ durationMs }} ms</div></div></template>
