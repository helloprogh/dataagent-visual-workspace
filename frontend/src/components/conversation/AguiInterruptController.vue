<script setup lang="ts">
import { watch } from 'vue'
import { useInterrupt } from '@copilotkit/vue/v2'
import AguiInterruptCard from './AguiInterruptCard.vue'

const emit = defineEmits<{ 'active-change': [active: boolean] }>()

// This controller is rendered inside CopilotChat's input slot, which is already
// wrapped by CopilotChatConfigurationProvider with the active agentId + threadId.
// Keep the standard CopilotKit lifecycle authoritative. The card itself is
// teleported to the conversation root so the message scroll layer cannot cover
// it, while the composable still executes in the exact CopilotChat thread scope.
const {
  hasInterrupt,
  slotProps,
} = useInterrupt({ renderInChat: false })

watch(hasInterrupt, active => emit('active-change', active), { immediate: true })
</script>

<template>
  <Teleport defer to=".conversation-chat">
    <div v-if="slotProps" class="agui-interrupt-controller">
      <AguiInterruptCard
        :interrupt="slotProps.interrupt"
        :interrupts="slotProps.interrupts"
        :resolve="slotProps.resolve"
        :cancel="slotProps.cancel"
      />
    </div>
  </Teleport>
</template>

<style scoped>
.agui-interrupt-controller{
  position:absolute;
  z-index:60;
  left:14px;
  right:14px;
  bottom:92px;
  max-height:calc(100% - 112px);
  overflow:auto;
  overscroll-behavior:contain;
  pointer-events:auto;
  scrollbar-width:thin;
  scrollbar-color:rgba(255,255,255,.14) transparent;
}
.agui-interrupt-controller::-webkit-scrollbar{width:8px}
.agui-interrupt-controller::-webkit-scrollbar-track{background:transparent}
.agui-interrupt-controller::-webkit-scrollbar-thumb{border:2px solid transparent;border-radius:999px;background:rgba(255,255,255,.14);background-clip:padding-box}
@media(max-width:540px){
  .agui-interrupt-controller{left:8px;right:8px;bottom:82px;max-height:calc(100% - 96px)}
}
</style>
