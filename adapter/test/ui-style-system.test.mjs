import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'

const frontend = (path) => fs.readFile(new URL(`../../frontend/src/${path}`, import.meta.url), 'utf8')

function vueTemplate(source) {
  const start = source.indexOf('<template>')
  const end = source.lastIndexOf('</template>')
  if (start === -1 || end === -1 || end < start) return source
  return source.slice(start, end + '</template>'.length)
}

test('runtime entry uses the new app, feature and shared architecture', async () => {
  const [main, app, tsconfig] = await Promise.all([
    frontend('main.ts'),
    frontend('app/App.vue'),
    fs.readFile(new URL('../../frontend/tsconfig.app.json', import.meta.url), 'utf8'),
  ])

  assert.match(main, /\.\/app\/App\.vue/)
  assert.match(main, /\.\/shared\/styles\/index\.css/)
  assert.doesNotMatch(main, /CopilotKit|@copilotkit|visual-workspace|workspace\/|genui\//i)

  assert.match(app, /features\/conversation/)
  assert.match(app, /features\/skill/)
  assert.match(app, /features\/tool/)
  assert.doesNotMatch(app, /CopilotKit|WorkspaceCanvas|GenUIBridge|workspaceController/i)

  assert.match(tsconfig, /src\/app\/\*\*\/\*\.vue/)
  assert.match(tsconfig, /src\/agui\/\*\*\/\*\.ts/)
  assert.match(tsconfig, /src\/features\/\*\*\/\*\.vue/)
  assert.match(tsconfig, /src\/shared\/\*\*\/\*\.ts/)
  assert.doesNotMatch(tsconfig, /src\/components|src\/copilot|src\/workspace|src\/genui/)
})

test('conversation presentation is Element-Plus-X over direct AG-UI client', async () => {
  const [agentChat, message, processGroup, client] = await Promise.all([
    frontend('features/conversation/components/AgentChat.vue'),
    frontend('features/conversation/components/ConversationMessage.vue'),
    frontend('features/conversation/components/ConversationProcessGroup.vue'),
    frontend('agui/client.ts'),
  ])

  assert.match(agentChat, /from 'vue-element-plus-x'/)
  assert.match(agentChat, /<XSender/)
  assert.match(agentChat, /<Welcome/)
  assert.match(agentChat, /<XSender[\s\S]*<template #prefix>[\s\S]*添加文件[\s\S]*<ModelSelector[\s\S]*<\/XSender>/)
  assert.match(agentChat, /presentationItems/)
  assert.match(agentChat, /kind: 'turn'/)
  assert.match(agentChat, /class="conversation-turn"/)
  assert.doesNotMatch(agentChat, /conversation-task|任务 \{\{/)
  assert.match(agentChat, /<ConversationProcessGroup/)
  assert.match(agentChat, /\.composer-input-actions :deep\(\.model-selector\) \{ margin-left: auto; \}/)
  assert.match(agentChat, /:deep\(\.chat-write-input\) \{ color: var\(--da-text-primary\); caret-color: var\(--da-text-emphasis\); \}/)
  assert.match(processGroup, /class="process-group__header"[\s\S]*:aria-expanded="expanded"/)
  assert.match(processGroup, /<ConversationMessage/)
  assert.match(processGroup, /class="process-group__steps"/)
  assert.match(processGroup, /class="process-step"/)
  assert.match(processGroup, /class="process-group__chevron"/)
  assert.match(processGroup, /\.process-group--expanded > \.process-group__header \.process-group__chevron/)
  assert.match(processGroup, /grid-template-rows: 0fr/)
  assert.match(processGroup, /grid-template-rows: 1fr/)
  assert.match(processGroup, /:deep\(\.tool-call-list\) \{ gap: 0; margin-top: 0; \}/)
  assert.match(processGroup, /\.process-step__content :deep\(\.reasoning-card::before\),[\s\S]*\.process-step__content :deep\(\.reasoning-node\) \{[\s\S]*display: none;/)
  assert.doesNotMatch(processGroup, /timeline|process-step__rail|stepTone/)
  assert.match(agentChat, /if \(isHiddenActivityMessage\(message\)\) continue/)
  assert.doesNotMatch(agentChat, /composer-toolbar/)
  assert.doesNotMatch(agentChat, /\bclearable\b/)
  assert.doesNotMatch(agentChat, /后端中断失败|abort/i)
  assert.doesNotMatch(agentChat, /CopilotChat|@copilotkit|\buseAgent\s*\(/i)
  assert.match(message, /<Bubble/)
  assert.match(client, /new HttpAgent/)
  assert.doesNotMatch(client, /CopilotRuntime|selfManagedAgents|@copilotkit/i)
})

test('conversation activity and tool results use product-facing progressive disclosure', async () => {
  const message = await frontend('features/conversation/components/ConversationMessage.vue')
  assert.doesNotMatch(message.match(/<template>([\s\S]*?)<\/template>/)?.[1] ?? '', /activityType|JSON\.stringify|Tool Result/)
  assert.match(message, /任务已进入队列/)
  assert.match(message, /<details v-else-if="isTool"/)
  assert.match(message, /visible:\s*status !== 'completed'/)
  assert.match(message, /isActivity && activity\.visible/)
  assert.match(message, /reasoning-card--running/)
  assert.match(message, /\.reasoning-card\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/s)
  assert.match(message, /@keyframes reasoning-pulse/)
  assert.match(message, /class="disclosure-icon"/)
  assert.match(message, /\.tool-call, \.tool-result-card\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/s)
  assert.match(message, /\.tool-call\[open\] \.disclosure-icon/)
  assert.doesNotMatch(message, /content:\s*'展开'|content:\s*'收起'/)
  assert.doesNotMatch(message, /\.tool-call, \.tool-result-card, \.activity-card, \.reasoning-card/)
})

test('conversation files open a pushed preview panel and approvals stay backend-schema driven', async () => {
  const [chat, message, preview, interrupt] = await Promise.all([
    frontend('features/conversation/components/AgentChat.vue'),
    frontend('features/conversation/components/ConversationMessage.vue'),
    frontend('features/conversation/components/FilePreviewPanel.vue'),
    frontend('features/conversation/components/InterruptCard.vue'),
  ])
  assert.match(message, /class="attachment-card"/)
  assert.match(message, /approvalInterruptId/)
  assert.match(chat, /agent-chat-layout--preview/)
  assert.match(chat, /<DeliverablesPanel/)
  assert.match(chat, /deliverablesOpen/)
  assert.match(chat, /previewInterrupts/)
  assert.match(preview, /<MarkdownRenderer/)
  assert.match(preview, /<InterruptCard/)
  assert.match(interrupt, /responseSchema/)
  assert.doesNotMatch(vueTemplate(preview), /取消本次运行/)
})

test('dark theme synchronizes Element Plus and keeps the welcome surface transparent', async () => {
  const [main, theme, chat] = await Promise.all([
    frontend('main.ts'),
    frontend('shared/theme/theme.ts'),
    frontend('features/conversation/components/AgentChat.vue'),
  ])
  assert.match(main, /element-plus\/theme-chalk\/dark\/css-vars\.css/)
  assert.match(theme, /classList\.toggle\('dark'/)
  assert.match(chat, /\.elx-welcome/)
  assert.match(chat, /--elx-welcome-filled-bg:\s*transparent/)
  assert.match(chat, /class="agent-welcome__brand"/)
  assert.match(chat, /class="agent-welcome__title"/)
  assert.match(chat, /\.agent-welcome__brand\s*\{[^}]*align-items:\s*center;[^}]*text-align:\s*center;/s)
  assert.match(chat, /\.agent-welcome__title\s*\{[^}]*justify-content:\s*center;/s)
  assert.match(chat, /\.elx-welcome__description\)\s*\{[^}]*white-space:\s*nowrap/s)
  const base = await frontend('shared/styles/base.css')
  assert.match(base, /\.dataagent-app\s*\{/)
  assert.doesNotMatch(base, /\.dataagent-shell/)
})

test('workspace and generated workspace UI are not part of the new runtime shell', async () => {
  const [app, chat, sidebar] = await Promise.all([
    frontend('app/App.vue'),
    frontend('features/conversation/components/AgentChat.vue'),
    frontend('features/conversation/components/ConversationSidebar.vue'),
  ])
  const template = vueTemplate(sidebar)

  for (const source of [app, chat, template]) {
    assert.doesNotMatch(source, /workspace\.render|workspace\.upsert|workspace\.remove|workspace\.agents/i)
    assert.doesNotMatch(source, /WorkspaceCanvas|GenUIBridge|动态渲染区/i)
  }
})

test('new business styles use design tokens and rem geometry', async () => {
  const sources = await Promise.all([
    frontend('app/App.vue'),
    frontend('features/conversation/components/AgentChat.vue'),
    frontend('features/conversation/components/ConversationMessage.vue'),
    frontend('features/conversation/components/ConversationSidebar.vue'),
    frontend('features/conversation/components/InterruptCard.vue'),
    frontend('features/conversation/components/FilePreviewPanel.vue'),
    frontend('features/conversation/pages/HistoryPage.vue'),
    frontend('features/model/components/ModelSelector.vue'),
    frontend('features/skill/pages/SkillPage.vue'),
    frontend('features/tool/pages/ToolPage.vue'),
    frontend('shared/styles/tokens.css'),
    frontend('shared/styles/base.css'),
    frontend('shared/styles/app.css'),
  ])

  for (const source of sources) {
    assert.doesNotMatch(source, /(?:^|[^\w-])\d+(?:\.\d+)?px\b/i)
  }
  assert.match(sources.join('\n'), /var\(--da-/)
})

test('user-facing shell does not expose transport or framework terminology', async () => {
  const sources = await Promise.all([
    frontend('app/App.vue'),
    frontend('features/conversation/components/AgentChat.vue'),
    frontend('features/conversation/components/ConversationSidebar.vue'),
    frontend('features/conversation/components/InterruptCard.vue'),
  ])

  for (const source of sources) {
    assert.doesNotMatch(vueTemplate(source), /AG-UI|CopilotKit|OpenCode/i)
  }
})

test('tool page exposes the factual runtime capability catalog without workspace UI controls', async () => {
  const [page, api] = await Promise.all([
    frontend('features/tool/pages/ToolPage.vue'),
    frontend('features/tool/api/tool.ts'),
  ])

  assert.match(page, /搜索工具或能力/)
  assert.match(page, /MCP/)
  assert.match(api, /dataAgentWebApi\('\/tools'\)/)
  assert.doesNotMatch(page, /工作空间管理|WorkspaceCanvas|workspace\.render/i)
})
