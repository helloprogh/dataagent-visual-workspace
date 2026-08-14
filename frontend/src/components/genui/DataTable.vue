<script setup lang="ts">
defineProps<{ title?: string; columns?: Array<{ key: string; label: string }>; rows?: Array<Record<string, unknown>> }>()
</script>
<template>
  <div class="gen-card"><div class="gen-title">{{ title || '数据结果' }}</div>
    <el-table :data="rows || []" size="small" max-height="320" stripe>
      <el-table-column v-for="c in (columns || [])" :key="c.key" :prop="c.key" :label="c.label" min-width="120" show-overflow-tooltip />
    </el-table>
  </div>
</template>
