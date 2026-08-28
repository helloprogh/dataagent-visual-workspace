import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'

const frontend = (path) => fs.readFile(new URL(`../../frontend/src/${path}`, import.meta.url), 'utf8')

test('product styles have one owner per major surface', async () => {
  const [main, shell, workspace, pages, management, theme] = await Promise.all([
    frontend('main.ts'),
    frontend('layout-shell.css'),
    frontend('visual-workspace.css'),
    frontend('app-navigation-pages.css'),
    frontend('opencode-management.css'),
    frontend('uiux-soft-technical-dark.css'),
  ])

  assert.doesNotMatch(main, /style\.css|sidebar-hierarchy\.css|skill-delete\.css/)
  assert.match(main, /visual-workspace\.css/)

  assert.match(shell, /\.app-sidebar\s*\{/)
  assert.match(shell, /\.app-main-stage--chat\s*\{/)
  assert.doesNotMatch(shell, /\.visual-toolbar|\.workspace-grid|\.widget-frame|\.gen-card/)

  assert.match(workspace, /\.visual-toolbar\s*\{/)
  assert.match(workspace, /\.workspace-grid\s*\{/)
  assert.match(workspace, /\.widget-frame\s*\{/)
  assert.match(workspace, /\.gen-card\s*\{/)

  assert.doesNotMatch(theme, /\.visual-toolbar|\.workspace-grid|\.widget-frame|\.gen-card/)
  assert.doesNotMatch(pages, /\.app-sidebar(?:__|\s|\{)/)
  assert.doesNotMatch(pages, /\.app-main-stage--chat/)
  assert.match(management, /\.skill-management-simple/)
})

test('legacy multi-generation style layers are not imported', async () => {
  const main = await frontend('main.ts')
  assert.doesNotMatch(main, /style\.css/)
  assert.doesNotMatch(main, /V4|V5\.1|V5\.2|V5\.3/)
})

test('product shell does not use a global typography override', async () => {
  const files = await Promise.all([
    frontend('layout-shell.css'),
    frontend('visual-workspace.css'),
    frontend('app-navigation-pages.css'),
    frontend('opencode-management.css'),
    frontend('composer-model-placement.css'),
  ])

  for (const css of files) {
    assert.doesNotMatch(css, /\.dataagent-shell\s+\*\s*\{[^}]*font-size/i)
  }
})

test('workspace production typography avoids micro text', async () => {
  const workspace = await frontend('visual-workspace.css')
  assert.doesNotMatch(workspace, /font-size\s*:\s*(?:[1-9]|10)px/i)
})

test('workspace Markdown presentation belongs to the workspace style owner', async () => {
  const [workspace, markdown] = await Promise.all([
    frontend('visual-workspace.css'),
    frontend('components/genui/MarkdownPanel.vue'),
  ])

  assert.match(workspace, /\.markdown-panel\s*\{/)
  assert.match(workspace, /\.markdown-content\s*\{/)
  assert.doesNotMatch(markdown, /<style(?:\s|>)/i)
})

test('composer and attachment presentation each have a single owner', async () => {
  const [theme, composer, conversation] = await Promise.all([
    frontend('uiux-soft-technical-dark.css'),
    frontend('composer-model-placement.css'),
    frontend('components/conversation/ConversationChat.vue'),
  ])

  assert.match(composer, /\.conversation-composer\s*\{/)
  assert.match(composer, /\.conversation-composer__controls\s*\{/)
  assert.doesNotMatch(conversation, /\.conversation-composer\s*\{[^}]*border/i)
  assert.doesNotMatch(conversation, /\.conversation-composer__controls\s*\{/)
  assert.match(conversation, /copilot-chat-attachment-item/)
  assert.doesNotMatch(theme, /copilot-chat-attachment-item|copilot-chat-attachment-document-filename/)
})

test('sidebar exposes product copy instead of transport terminology', async () => {
  const sidebar = await frontend('components/AppSidebar.vue')
  const template = sidebar.match(/<template>[\s\S]*?<\/template>/)?.[0] ?? sidebar

  assert.match(template, /服务已连接/)
  assert.doesNotMatch(template, /AG-UI|CopilotKit|OpenCode/i)
})

test('visible controls keep native icons and centered action labels', async () => {
  const [composer, shell, approval] = await Promise.all([
    frontend('composer-model-placement.css'),
    frontend('layout-shell.css'),
    frontend('components/conversation/AguiInterruptCard.vue'),
  ])

  assert.doesNotMatch(composer, /copilot-chat-input-add[^}]*>\s*svg\s*\{\s*display\s*:\s*none/i)
  assert.doesNotMatch(composer, /filter\s*:\s*brightness\(0\)\s*invert\(1\)/i)
  assert.match(composer, /copilot-chat-input-add[^}]*>svg\s*\{[\s\S]*display:block!important[\s\S]*stroke:currentColor!important[\s\S]*filter:none!important/i)
  assert.match(shell, /\.app-sidebar__nav-icon\s*\{[\s\S]*display:grid[\s\S]*place-items:center/)
  assert.match(approval, /approval-request__choices button,[\s\S]*flex:0 0 auto[\s\S]*display:inline-flex[\s\S]*align-items:center[\s\S]*justify-content:center[\s\S]*line-height:1!important/)
})

test('approval choice controls are not nested inside label elements', async () => {
  const approval = await frontend('components/conversation/AguiInterruptCard.vue')
  const template = approval.match(/<template>[\s\S]*?<\/template>/)?.[0] ?? approval

  assert.doesNotMatch(template, /<label[^>]*approval-request__field/)
  assert.match(template, /class="approval-request__field-label"/)
  assert.match(template, /class="approval-request__choices" role="group"/)
  assert.match(approval, /approval-request__footer:not\(:has\(\.primary\)\)\{justify-content:flex-start\}/)
})

test('workspace header exposes product language instead of demo implementation labels', async () => {
  const canvas = await frontend('components/WorkspaceCanvas.vue')
  const template = canvas.match(/<template>[\s\S]*?<\/template>/)?.[0] ?? canvas

  assert.match(template, /分析结果/)
  assert.doesNotMatch(template, /DYNAMIC RENDER SPACE|Agent driven|RENDER|UPDATED|READY/)
})
