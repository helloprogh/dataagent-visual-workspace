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
      <b>{{ status === 'complete' ? '数据编排工作区已同步' : '正在组织交付工作区…' }}</b>
      <small>{{ name }}</small>
    </div>
  </div>
</template>
