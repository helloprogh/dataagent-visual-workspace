<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Message } from '@ag-ui/client'
import { useI18n } from 'vue-i18n'
import { Welcome } from 'vue-element-plus-x'
import type { PresentationItem, ProcessStep } from '../processPresentation'
import type { ConversationFilePreview } from '../types/filePreview'
import AgentMark from './AgentMark.vue'
import ConversationMessage from './ConversationMessage.vue'
import ConversationProcessGroup from './ConversationProcessGroup.vue'
import GeneratedArtifactCard from './GeneratedArtifactCard.vue'

const props = defineProps<{
  hydrating: boolean
  messages: Message[]
  running: boolean
  nextCursor?: string
  loadingOlder: boolean
  presentationItems: PresentationItem[]
  pendingInterruptIds: string[]
  activeTextId: string
  animatedMessageIds: Set<string>
  showResponsePending: boolean
  responsePhase: 'waiting' | 'thinking' | 'responding' | 'working'
  showJumpToLatest: boolean
  welcomeDescription: string
  starterPrompts: Array<{ icon: string; title: string; description: string; prompt: string }>
  generatedFilesForProcess: (steps: ProcessStep[]) => ConversationFilePreview[]
}>()

const emit = defineEmits<{
  scroller: [element: HTMLElement | null]
  scroll: []
  loadOlder: []
  starter: [prompt: string]
  preview: [file: ConversationFilePreview]
  confirm: [interruptId: string]
  cancel: [interruptId: string]
  a2uiAction: [action: unknown]
  reveal: []
  continue: [message: Message]
  jumpLatest: []
}>()

const { t, tm } = useI18n()
const messageScroller = ref<HTMLElement | null>(null)

onMounted(() => emit('scroller', messageScroller.value))
onBeforeUnmount(() => emit('scroller', null))
</script>

<template>
  <div
    ref="messageScroller"
    data-testid="conversation-messages"
    class="agent-chat__messages"
    @scroll.passive="emit('scroll')"
  >
    <div v-if="hydrating" class="agent-chat__loading">
      <el-skeleton :rows="6" animated />
    </div>

    <div v-else-if="!messages.length && !running" class="agent-welcome">
      <div class="agent-welcome__brand">
        <div class="agent-welcome__orbit" aria-hidden="true"><span></span><span></span><i></i><AgentMark /></div>
        <span class="agent-welcome__eyebrow">{{ t('chat.eyebrow') }}</span>
        <div class="agent-welcome__title">
          <h1>{{ t('chat.heroTitle') }}<span>{{ t('chat.heroAccent') }}</span></h1>
        </div>
        <Welcome variant="borderless" :description="welcomeDescription" />
        <ol class="welcome-workflow" :aria-label="t('chat.workflowAria')">
          <li v-for="(label, index) in (tm('chat.workflow') as string[])" :key="label"><span>{{ String(index + 1).padStart(2, '0') }}</span>{{ label }}</li>
        </ol>
        <div class="starter-prompts" :aria-label="t('chat.starterAria')">
          <button v-for="item in starterPrompts" :key="item.title" type="button" @click="emit('starter', item.prompt)">
            <span aria-hidden="true">{{ item.icon }}</span>
            <b>{{ item.title }}</b>
            <small>{{ item.description }}</small>
          </button>
        </div>
      </div>
    </div>

    <div v-else class="message-list">
      <div v-if="nextCursor" class="load-older">
        <el-button text :loading="loadingOlder" @click="emit('loadOlder')">{{ t('chat.loadEarlier') }}</el-button>
      </div>
      <template v-for="item in presentationItems" :key="item.key">
        <section v-if="item.kind === 'turn'" class="conversation-turn">
          <div :data-message-id="item.user.id">
            <ConversationMessage :message="item.user" :running="running" :pending-interrupt-ids="pendingInterruptIds" @preview="emit('preview', $event)" @confirm="emit('confirm', $event)" @cancel="emit('cancel', $event)" @a2ui-action="emit('a2uiAction', $event)" />
          </div>
          <div class="conversation-turn__response">
            <template v-for="child in item.children" :key="child.key">
              <template v-if="child.kind === 'process'">
                <ConversationProcessGroup :steps="child.steps" :running="child.running" :busy="running" :settled="child.settled" :active-reasoning-id="child.activeReasoningId" @preview="emit('preview', $event)" @continue="emit('continue', $event)" />
                <GeneratedArtifactCard
                  v-for="file in generatedFilesForProcess(child.steps)"
                  :key="`generated-card-${file.id}`"
                  :file="file"
                  :pending="file.approvalInterruptId ? pendingInterruptIds.includes(file.approvalInterruptId) : false"
                  :busy="running"
                  @preview="emit('preview', $event)"
                  @confirm="emit('confirm', $event)"
                  @cancel="emit('cancel', $event)"
                />
              </template>
              <ConversationMessage
                v-else
                :message="child.message"
                :running="running"
                :animate="animatedMessageIds.has(child.message.id)"
                :streaming="running && activeTextId === child.message.id"
                :pending-interrupt-ids="pendingInterruptIds"
                :data-message-id="child.message.id"
                @reveal="emit('reveal')"
                @preview="emit('preview', $event)"
                @confirm="emit('confirm', $event)"
                @cancel="emit('cancel', $event)"
                @a2ui-action="emit('a2uiAction', $event)"
              />
            </template>
          </div>
        </section>

        <template v-else-if="item.kind === 'process'">
          <ConversationProcessGroup :steps="item.steps" :running="item.running" :busy="running" :settled="item.settled" :active-reasoning-id="item.activeReasoningId" @preview="emit('preview', $event)" @continue="emit('continue', $event)" />
          <GeneratedArtifactCard
            v-for="file in generatedFilesForProcess(item.steps)"
            :key="`generated-card-${file.id}`"
            :file="file"
            :pending="file.approvalInterruptId ? pendingInterruptIds.includes(file.approvalInterruptId) : false"
            :busy="running"
            @preview="emit('preview', $event)"
            @confirm="emit('confirm', $event)"
            @cancel="emit('cancel', $event)"
          />
        </template>

        <ConversationMessage
          v-else
          :message="item.message"
          :running="running"
          :animate="animatedMessageIds.has(item.message.id)"
          :streaming="running && activeTextId === item.message.id"
          :pending-interrupt-ids="pendingInterruptIds"
          :data-message-id="item.message.id"
          @reveal="emit('reveal')"
          @preview="emit('preview', $event)"
          @confirm="emit('confirm', $event)"
          @cancel="emit('cancel', $event)"
          @a2ui-action="emit('a2uiAction', $event)"
        />
      </template>

      <div v-if="showResponsePending" class="response-pending" role="status" aria-live="polite">
        <span class="response-pending__dots" aria-hidden="true"><i></i><i></i><i></i></span>
        <span>{{ responsePhase === 'responding' ? t('chat.responseOrganizing') : t('chat.responseWaiting') }}</span>
      </div>
    </div>
  </div>

  <Transition name="jump-latest">
    <button v-if="showJumpToLatest" class="jump-latest" type="button" @click="emit('jumpLatest')">
      <span aria-hidden="true">↓</span> {{ t('chat.backLatest') }}
    </button>
  </Transition>
</template>

<style scoped>
.agent-chat__messages { min-height: 0; overflow: auto; padding: var(--da-space-6) clamp(1rem, 4vw, 3.5rem) var(--da-space-8); scrollbar-gutter: stable; }
.agent-chat__loading, .message-list, .agent-welcome { width: min(100%, var(--da-content-max)); margin: 0 auto; }
.message-list { display: flex; flex-direction: column; gap: var(--da-space-5); }
.response-pending { display: flex; min-height: 2rem; align-items: center; gap: var(--da-space-3); color: var(--da-text-muted); font-size: var(--da-font-size-sm); }
.response-pending__dots { display: flex; align-items: center; gap: 0.25rem; }
.response-pending__dots i { width: 0.25rem; height: 0.25rem; border-radius: 50%; background: var(--da-accent-primary); animation: response-pulse 1s ease-in-out infinite; }
.response-pending__dots i:nth-child(2) { animation-delay: 150ms; }
.response-pending__dots i:nth-child(3) { animation-delay: 300ms; }
@keyframes response-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
.conversation-turn { display: flex; min-width: 0; flex-direction: column; gap: var(--da-space-3); }
.conversation-turn__response { display: flex; min-width: 0; flex-direction: column; gap: var(--da-space-3); }
.load-older { display: flex; justify-content: center; min-height: 2.25rem; }
.agent-welcome { display: flex; min-height: 100%; align-items: center; justify-content: center; padding: var(--da-space-10) 0; }
.agent-welcome__brand { display: flex; width: min(100%, 64rem); flex-direction: column; align-items: center; gap: var(--da-space-3); text-align: center; }
.agent-welcome__eyebrow { color: var(--da-brand-cyan); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.16em; }
.agent-welcome__title { display: flex; align-items: center; justify-content: center; gap: var(--da-space-4); }
.agent-welcome__title h1 { margin: 0; color: var(--da-text-emphasis); font-size: clamp(1.75rem, 3vw, 2.75rem); font-weight: 650; letter-spacing: -0.045em; line-height: 1.35; }
.agent-welcome__title h1 > span { display: block; color: var(--da-accent-primary); background: var(--da-gradient-accent); background-clip: text; -webkit-text-fill-color: transparent; }
.agent-welcome__orbit { position: relative; display: grid; width: 8.5rem; height: 6.75rem; margin-bottom: var(--da-space-2); place-items: center; }
.agent-welcome__orbit::before { content: ''; position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(ellipse, var(--da-brand-glow), transparent 70%); transform: scale(1.8); pointer-events: none; }
.agent-welcome__orbit > span { position: absolute; width: 8.25rem; height: 4.5rem; border: 0.0625rem solid color-mix(in srgb, var(--da-brand-cyan) 24%, transparent); border-radius: 50%; transform: rotate(-24deg); }
.agent-welcome__orbit > span:nth-child(2) { transform: rotate(35deg); border-color: color-mix(in srgb, var(--da-accent-primary) 24%, transparent); }
.agent-welcome__orbit > i { position: absolute; top: 1.45rem; right: 0.75rem; width: 0.375rem; height: 0.375rem; border-radius: 50%; background: var(--da-brand-cyan); box-shadow: 0 0 0.75rem var(--da-brand-cyan); }
.agent-welcome__orbit :deep(.agent-mark) { width: 3.5rem; height: 3.5rem; transform: rotate(-8deg); animation: brand-float 6s ease-in-out infinite; }
@keyframes brand-float { 0%, 100% { transform: translateY(0) rotate(-8deg); } 50% { transform: translateY(-0.3rem) rotate(-3deg); } }
.welcome-workflow { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--da-space-3); margin: var(--da-space-4) 0 0; padding: 0; list-style: none; }
.welcome-workflow li { display: flex; align-items: center; gap: 0.375rem; color: var(--da-text-muted); font-size: 0.75rem; }
.welcome-workflow li > span { color: var(--da-brand-cyan); font-family: ui-monospace, Consolas, monospace; font-size: 0.625rem; }
.welcome-workflow li:not(:last-child)::after { content: ''; width: 1.25rem; height: 0.0625rem; margin-left: var(--da-space-2); background: var(--da-border-strong); }
.agent-welcome :deep(.elx-welcome) { width: 100%; min-width: 0; justify-content: center; padding: 0; --elx-welcome-filled-bg: transparent; --elx-welcome-filled-border: transparent; --elx-welcome-description-color: var(--da-text-muted); background: transparent; }
.agent-welcome :deep(.elx-welcome__content) { flex: 0 1 auto; }
.agent-welcome :deep(.elx-welcome__description) { font-size: var(--da-font-size-md); line-height: 1.75; text-align: center; white-space: nowrap; }
.starter-prompts { display: grid; width: min(100%, 46rem); grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--da-space-3); margin-top: var(--da-space-5); }
.starter-prompts button { position: relative; display: grid; min-width: 0; gap: 0.5rem; padding: var(--da-space-5) var(--da-space-4); border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-lg); color: var(--da-text-muted); background: linear-gradient(135deg, var(--da-accent-primary-soft), transparent 75%), var(--da-surface-1); box-shadow: var(--da-shadow-card); cursor: pointer; text-align: left; transition: transform 180ms ease, border-color 180ms ease, color 180ms ease, background-color 180ms ease, box-shadow 180ms ease; }
.starter-prompts button > span { position: absolute; top: var(--da-space-3); right: var(--da-space-3); color: var(--da-brand-cyan); font-size: var(--da-font-size-sm); transition: transform 180ms ease; }
.starter-prompts button b { color: var(--da-text-primary); font-size: var(--da-font-size-sm); font-weight: 600; }
.starter-prompts button small { overflow: hidden; font-size: var(--da-font-size-xs); line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
.starter-prompts button:hover { border-color: color-mix(in srgb, var(--da-accent-primary) 38%, var(--da-border)); color: var(--da-text-secondary); background: var(--da-surface-2); box-shadow: 0 0.75rem 2rem var(--da-brand-glow); transform: translateY(-0.125rem); }
.starter-prompts button:hover > span { transform: translate(0.125rem, -0.125rem); }
.starter-prompts button:active { transform: translateY(0); }
.jump-latest { position: absolute; z-index: 4; bottom: 7.25rem; left: 50%; display: inline-flex; min-height: 2rem; align-items: center; gap: var(--da-space-2); padding: 0 var(--da-space-3); border: 0.0625rem solid var(--da-border-strong); border-radius: 999rem; color: var(--da-text-secondary); background: color-mix(in srgb, var(--da-surface-2) 92%, transparent); box-shadow: var(--da-shadow-card); cursor: pointer; font-size: var(--da-font-size-xs); transform: translateX(-50%); backdrop-filter: blur(0.75rem); }
.jump-latest:hover { border-color: var(--da-border-focus); color: var(--da-text-emphasis); }
.jump-latest-enter-active, .jump-latest-leave-active { transition: opacity 160ms ease, transform 160ms ease; }
.jump-latest-enter-from, .jump-latest-leave-to { opacity: 0; transform: translate(-50%, 0.5rem); }
@media (max-width: 48rem) {
  .agent-chat__messages { padding-inline: var(--da-space-4); }
  .starter-prompts { grid-template-columns: 1fr; }
  .starter-prompts button { padding-block: var(--da-space-3); }
}
@media (max-width: 34rem) {
  .welcome-workflow { gap: var(--da-space-2); }
  .welcome-workflow li:not(:last-child)::after { display: none; }
  .agent-welcome__orbit { height: 5.5rem; }
  .agent-chat__messages { padding-inline: var(--da-space-3); }
}
@media (max-width: 72rem) { .agent-welcome :deep(.elx-welcome__description) { white-space: normal; } }
@media (prefers-reduced-motion: reduce) {
  .agent-welcome__orbit :deep(.agent-mark), .response-pending__dots i { animation: none; }
  .starter-prompts button, .starter-prompts button > span, .jump-latest-enter-active, .jump-latest-leave-active { transition: none; }
}
</style>
