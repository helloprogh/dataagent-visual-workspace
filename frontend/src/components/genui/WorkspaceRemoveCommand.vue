<script setup lang="ts">
import { watchEffect } from 'vue'
import { workspaceController } from '../../workspace/store'
const props = defineProps<{ id?: string; status?: 'inProgress' | 'executing' | 'complete' }>()
let last = ''
watchEffect(() => {
  if (!props.id || props.id === last) return
  last = props.id
  workspaceController.remove(props.id)
})
</script>
<template><div class="workspace-command-status compact"><span class="workspace-command-icon">−</span><div><b>模块已移除</b><small>{{ id }}</small></div></div></template>
