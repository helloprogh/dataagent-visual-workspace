<script setup lang="ts">
defineProps<{
  name: string
  toolCallId: string
  status: 'inProgress' | 'executing' | 'complete'
  parameters?: Record<string, unknown>
  result?: string
}>()
</script>
<template>
  <div class="workspace-command-status compact">
    <span class="workspace-command-icon">⌁</span>
    <div>
      <b>{{ status === 'complete' ? '分析工作区已同步' : '正在组织可视化…' }}</b>
      <small>{{ name }}</small>
    </div>
  </div>
</template>
