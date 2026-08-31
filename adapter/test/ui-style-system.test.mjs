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
  const [agentChat, message, client] = await Promise.all([
    frontend('features/conversation/components/AgentChat.vue'),
    frontend('features/conversation/components/ConversationMessage.vue'),
    frontend('agui/client.ts'),
  ])

  assert.match(agentChat, /from 'vue-element-plus-x'/)
  assert.match(agentChat, /<XSender/)
  assert.match(agentChat, /<Welcome/)
  assert.doesNotMatch(agentChat, /CopilotChat|useAgent|@copilotkit/i)
  assert.match(message, /<Bubble/)
  assert.match(client, /new HttpAgent/)
  assert.doesNotMatch(client, /CopilotRuntime|selfManagedAgents|@copilotkit/i)
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
