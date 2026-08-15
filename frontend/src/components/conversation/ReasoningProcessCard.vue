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
            <small>AG-UI REASONING</small>
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
  margin:16px 0 20px;
  overflow:hidden;
  border:1px solid rgba(120,196,222,.24);
  border-radius:15px;
  background:
    radial-gradient(circle at 0 0,rgba(91,193,217,.10),transparent 44%),
    linear-gradient(145deg,rgba(27,39,51,.96),rgba(22,28,40,.97));
  box-shadow:inset 0 1px rgba(255,255,255,.04),0 10px 28px rgba(0,0,0,.16);
  transition:border-color .2s ease,box-shadow .2s ease;
}
.reasoning-card.is-streaming{
  border-color:rgba(114,223,238,.48);
  box-shadow:inset 0 1px rgba(255,255,255,.05),0 0 0 3px rgba(91,193,217,.055),0 12px 30px rgba(0,0,0,.18);
}
.reasoning-card :deep([data-copilotkit]){margin:0!important}
.reasoning-card__header{
  width:100%;
  min-height:68px;
  padding:12px 15px;
  display:grid;
  grid-template-columns:38px minmax(0,1fr) auto 18px;
  align-items:center;
  gap:11px;
  border:0;
  background:transparent;
  color:#eef4f8!important;
  text-align:left;
  cursor:default;
}
.reasoning-card__header.can-expand{cursor:pointer}
.reasoning-card__header.can-expand:hover{background:rgba(255,255,255,.025)}
.reasoning-card__header:disabled{opacity:1}
.reasoning-card__icon{
  position:relative;
  width:38px;
  height:38px;
  display:grid;
  place-items:center;
  border:1px solid rgba(114,223,238,.28);
  border-radius:11px;
  background:linear-gradient(145deg,rgba(114,223,238,.13),rgba(139,150,255,.10));
}
.reasoning-card__icon i{
  position:absolute;
  width:6px;
  height:6px;
  border-radius:50%;
  background:#8ddce9;
  box-shadow:0 0 10px rgba(114,223,238,.38);
}
.reasoning-card__icon i:nth-child(1){transform:translate(-7px,4px)}
.reasoning-card__icon i:nth-child(2){transform:translate(0,-6px)}
.reasoning-card__icon i:nth-child(3){transform:translate(7px,4px)}
.reasoning-card__icon::before,
.reasoning-card__icon::after{
  content:"";
  position:absolute;
  top:19px;
  width:10px;
  height:1px;
  background:rgba(141,220,233,.55);
}
.reasoning-card__icon::before{left:9px;transform:rotate(-42deg)}
.reasoning-card__icon::after{right:9px;transform:rotate(42deg)}
.reasoning-card__heading{min-width:0;display:flex;flex-direction:column;gap:3px}
.reasoning-card__heading small{color:#91aeba!important;font-weight:700;letter-spacing:.11em}
.reasoning-card__heading b{color:#f4f7fa!important;font-size:15px!important;font-weight:650}
.reasoning-card__status{
  min-width:70px;
  padding:5px 9px;
  display:inline-flex;
  justify-content:center;
  align-items:center;
  gap:7px;
  border:1px solid rgba(255,255,255,.10);
  border-radius:999px;
  background:rgba(255,255,255,.035);
  color:#aeb9c7!important;
  white-space:nowrap;
}
.reasoning-card__status.active{border-color:rgba(114,223,238,.28);background:rgba(114,223,238,.07);color:#a9e9f1!important}
.reasoning-card__status>i{width:7px;height:7px;border-radius:50%;background:#72dfee;box-shadow:0 0 10px rgba(114,223,238,.62);animation:reasoning-pulse 1.25s ease-in-out infinite}
.reasoning-card__chevron{width:18px;height:18px;fill:none;stroke:#9eabbc;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;transition:transform .2s ease}
.reasoning-card__chevron.open{transform:rotate(90deg)}
.reasoning-card :deep([data-message-id] > div > div > div){
  margin:0 15px;
  padding:14px 0 16px!important;
  border-top:1px solid rgba(148,190,207,.15);
}
.reasoning-card :deep([data-message-id] > div > div > div > div){
  color:#c4ced9!important;
  font-size:14px!important;
  line-height:1.7!important;
}
.reasoning-card :deep([data-message-id] > div > div > div > div :is(p,li,code,strong,em,span)){
  color:inherit!important;
}
@keyframes reasoning-pulse{0%,100%{opacity:.45;transform:scale(.85)}50%{opacity:1;transform:scale(1)}}
@media(max-width:540px){
  .reasoning-card__header{grid-template-columns:36px minmax(0,1fr) 18px;padding:11px 12px}
  .reasoning-card__status{display:none}
}
</style>
