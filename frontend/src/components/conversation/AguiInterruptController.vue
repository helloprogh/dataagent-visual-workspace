<script setup lang="ts">
import { watch } from 'vue'
import { useInterrupt } from '@copilotkit/vue/v2'
import { AGENT_ID } from '../../copilot/agent'

const emit = defineEmits<{ 'active-change': [active: boolean] }>()

// The controller is rendered through CopilotChat's input slot. Bind the native
// interrupt lifecycle to the project's actual self-managed agent explicitly so
// resolve/cancel always resume the same HttpAgent that produced the interrupt,
// independent of slot/provider injection boundaries.
const { hasInterrupt } = useInterrupt({ agentId: AGENT_ID })

watch(hasInterrupt, active => emit('active-change', active), { immediate: true })
</script>

<template>
  <span class="agui-interrupt-controller" aria-hidden="true"></span>
</template>

<style scoped>
.agui-interrupt-controller{display:none}
</style>
