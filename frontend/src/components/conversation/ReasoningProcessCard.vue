<script setup lang="ts">
import { CopilotChatReasoningMessage } from '@copilotkit/vue/v2'
import type { CopilotChatReasoningMessageLayoutSlotProps } from '@copilotkit/vue/v2'

type ReasoningMessage = CopilotChatReasoningMessageLayoutSlotProps['message']
type Message = CopilotChatReasoningMessageLayoutSlotProps['messages'][number]

defineProps<{
  message: ReasoningMessage
  messages: Message[]
  isRunning: boolean
}>()
</script>

<template>
  <article
    class="reasoning-card"
    :class="{ 'is-streaming': isRunning && messages.at(-1)?.id === message.id }"
    data-testid="agent-reasoning-card"
  >
    <CopilotChatReasoningMessage
      :message="message"
      :messages="messages"
      :is-running="isRunning"
    >
      <template #header="{ isOpen, hasContent, isStreaming, onClick }">
        <button
          type="button"
          class="reasoning-card__header"
          :class="{ 'can-expand': hasContent }"
          :aria-expanded="hasContent ? isOpen : undefined"
          :disabled="!hasContent"
          @click="onClick?.()"
        >
          <span class="reasoning-card__icon" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>

          <span class="reasoning-card__heading">
            <small>分析过程</small>
            <b>思考过程</b>
          </span>

          <span class="reasoning-card__status" :class="{ active: isStreaming }">
            <i v-if="isStreaming" aria-hidden="true" />
            {{ isStreaming ? '生成中' : '已完成' }}
          </span>

          <svg
            v-if="hasContent"
            class="reasoning-card__chevron"
            :class="{ open: isOpen }"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path d="m7.5 4.5 5 5.5-5 5.5" />
          </svg>
        </button>
      </template>
    </CopilotChatReasoningMessage>
  </article>
</template>

<style scoped>
.reasoning-card{
  margin:8px 0;
  overflow:hidden;
  border:0;
  border-left:2px solid transparent;
  border-radius:8px;
  background:rgba(255,255,255,.006);
  box-shadow:none;
  color:var(--da-text-primary);
  transition:background .16s ease,border-color .16s ease;
}
.reasoning-card.is-streaming{
  border-left-color:color-mix(in srgb,var(--da-accent-cyan) 58%,transparent);
  background:color-mix(in srgb,var(--da-accent-cyan) 2.1%,transparent);
}
.reasoning-card :deep([data-copilotkit]){margin:0!important}
.reasoning-card__header{
  width:100%;
  min-height:48px;
  padding:7px 9px;
  display:grid;
  grid-template-columns:26px minmax(0,1fr) auto 16px;
  align-items:center;
  gap:9px;
  border:0;
  background:transparent;
  color:var(--da-text-primary);
  text-align:left;
  cursor:default;
}
.reasoning-card__header.can-expand{cursor:pointer}
.reasoning-card__header.can-expand:hover{background:rgba(255,255,255,.014)}
.reasoning-card__header:focus-visible{outline:2px solid var(--da-border-focus);outline-offset:-2px}
.reasoning-card__header:disabled{opacity:1}
.reasoning-card__icon{
  position:relative;
  width:26px;
  height:26px;
  display:grid;
  place-items:center;
  border:0;
  border-radius:7px;
  background:rgba(255,255,255,.018);
}
.reasoning-card__icon i{
  position:absolute;
  width:4px;
  height:4px;
  border-radius:50%;
  background:var(--da-text-subtle);
}
.reasoning-card.is-streaming .reasoning-card__icon i{background:var(--da-accent-cyan)}
.reasoning-card__icon i:nth-child(1){transform:translate(-5px,3px)}
.reasoning-card__icon i:nth-child(2){transform:translate(0,-4px)}
.reasoning-card__icon i:nth-child(3){transform:translate(5px,3px)}
.reasoning-card__icon::before,.reasoning-card__icon::after{
  content:"";
  position:absolute;
  top:13px;
  width:7px;
  height:1px;
  background:color-mix(in srgb,var(--da-text-subtle) 44%,transparent);
}
.reasoning-card__icon::before{left:6px;transform:rotate(-42deg)}
.reasoning-card__icon::after{right:6px;transform:rotate(42deg)}
.reasoning-card__heading{min-width:0;display:flex;flex-direction:column;gap:1px}
.reasoning-card__heading small{color:var(--da-text-subtle);font-size:11px!important;font-weight:560}
.reasoning-card__heading b{color:var(--da-text-primary);font-size:14px!important;font-weight:610}
.reasoning-card__status{
  display:inline-flex;
  justify-content:center;
  align-items:center;
  gap:6px;
  color:var(--da-text-subtle);
  font-size:12px!important;
  white-space:nowrap;
}
.reasoning-card__status.active{color:var(--da-accent-cyan)}
.reasoning-card__status>i{width:5px;height:5px;border-radius:50%;background:var(--da-accent-cyan);animation:reasoning-pulse 1.25s ease-in-out infinite}
.reasoning-card__chevron{width:16px;height:16px;fill:none;stroke:var(--da-text-subtle);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;transition:transform .18s ease}
.reasoning-card__chevron.open{transform:rotate(90deg)}
.reasoning-card :deep([data-message-id] > div > div > div){
  margin:0 9px 0 35px;
  padding:7px 0 12px!important;
  border-top:1px solid color-mix(in srgb,var(--da-border) 62%,transparent);
}
.reasoning-card :deep([data-message-id] > div > div > div > div){
  color:var(--da-text-secondary)!important;
  font-size:14px!important;
  line-height:1.68!important;
}
.reasoning-card :deep([data-message-id] > div > div > div > div :is(p,li,code,strong,em,span)){color:inherit!important}
@keyframes reasoning-pulse{0%,100%{opacity:.46;transform:scale(.84)}50%{opacity:1;transform:scale(1)}}
@media(max-width:540px){
  .reasoning-card__header{grid-template-columns:26px minmax(0,1fr) 16px;padding:7px 8px}
  .reasoning-card__status{display:none}
  .reasoning-card :deep([data-message-id] > div > div > div){margin-left:33px}
}
@media(prefers-reduced-motion:reduce){
  .reasoning-card,.reasoning-card__chevron{transition:none}
  .reasoning-card__status>i{animation:none}
}
</style>