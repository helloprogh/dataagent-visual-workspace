import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(frontendRoot, '..')
const checkOnly = process.argv.includes('--check')
const outputRoot = checkOnly
  ? fs.mkdtempSync(path.join(os.tmpdir(), 'dataagent-style-pack-'))
  : path.join(frontendRoot, 'dist', 'dataagent-style-pack')

const sourceFiles = [
  ['src/shared/styles/tokens.css', 'src/shared/styles/tokens.css'],
  ['src/shared/styles/base.css', 'src/shared/styles/base.css'],
  ['src/shared/styles/app.css', 'src/shared/styles/app.css'],
  ['src/shared/styles/index.css', 'src/shared/styles/index.css'],
  ['src/shared/theme/theme.ts', 'src/shared/theme/theme.ts'],
  ['src/main.ts', 'reference/main.ts'],
  ['src/app/App.vue', 'reference/App.vue'],
  ['src/features/conversation/components/AgentMark.vue', 'reference/components/AgentMark.vue'],
  ['src/features/conversation/components/ConversationSidebar.vue', 'reference/components/ConversationSidebar.vue'],
  ['src/features/conversation/components/ConversationHeader.vue', 'reference/components/ConversationHeader.vue'],
  ['src/features/conversation/components/ConversationComposer.vue', 'reference/components/ConversationComposer.vue'],
  ['src/features/conversation/components/ConversationMessage.vue', 'reference/components/ConversationMessage.vue'],
  ['src/features/model/components/ModelSelector.vue', 'reference/components/ModelSelector.vue'],
  ['style-pack/README.md', 'README.md'],
  ['style-pack/component-contract.md', 'guidance/component-contract.md'],
  ['style-pack/AGENTS.snippet.md', 'guidance/AGENTS.snippet.md'],
  ['style-pack/replication-evals.json', 'guidance/replication-evals.json'],
]

const repoFiles = [
  ['design.md', 'guidance/source-design.md'],
]

function ensureParent(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
}

function copy(source, destination) {
  if (!fs.existsSync(source)) throw new Error(`Missing style-pack source: ${path.relative(repoRoot, source)}`)
  ensureParent(destination)
  fs.copyFileSync(source, destination)
}

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

fs.rmSync(outputRoot, { recursive: true, force: true })
fs.mkdirSync(outputRoot, { recursive: true })

for (const [source, destination] of sourceFiles) {
  copy(path.join(frontendRoot, source), path.join(outputRoot, destination))
}

for (const [source, destination] of repoFiles) {
  copy(path.join(repoRoot, source), path.join(outputRoot, destination))
}

const pkg = JSON.parse(fs.readFileSync(path.join(frontendRoot, 'package.json'), 'utf8'))
const stackNames = ['vue', 'element-plus', 'vue-element-plus-x', 'vite', 'typescript', '@vitejs/plugin-vue']
const peerStack = {
  generatedFrom: 'frontend/package.json',
  node: pkg.engines?.node ?? null,
  packageManager: pkg.packageManager ?? null,
  packages: Object.fromEntries(stackNames.map(name => [
    name,
    pkg.dependencies?.[name] ?? pkg.devDependencies?.[name] ?? null,
  ])),
}
fs.writeFileSync(path.join(outputRoot, 'peer-stack.json'), `${JSON.stringify(peerStack, null, 2)}\n`)

const exportedFiles = []
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else exportedFiles.push(full)
  }
}
walk(outputRoot)

const manifestFiles = exportedFiles
  .filter(file => path.basename(file) !== 'manifest.json')
  .map(file => ({
    path: path.relative(outputRoot, file).replaceAll(path.sep, '/'),
    sha256: hashFile(file),
  }))
  .sort((a, b) => a.path.localeCompare(b.path))

const manifest = {
  format: 'dataagent-same-stack-style-pack-v1',
  source: {
    repository: 'helloprogh/dataagent-visual-workspace',
    canonicalStyles: 'frontend/src/shared/styles',
    canonicalTheme: 'frontend/src/shared/theme/theme.ts',
    referencesAreCopyOnly: true,
  },
  files: manifestFiles,
}
fs.writeFileSync(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

const requiredOutput = [
  'README.md',
  'peer-stack.json',
  'manifest.json',
  'src/shared/styles/tokens.css',
  'src/shared/styles/base.css',
  'src/shared/styles/app.css',
  'src/shared/styles/index.css',
  'src/shared/theme/theme.ts',
  'reference/main.ts',
  'reference/App.vue',
  'reference/components/AgentMark.vue',
  'reference/components/ConversationSidebar.vue',
  'reference/components/ConversationHeader.vue',
  'reference/components/ConversationComposer.vue',
  'reference/components/ConversationMessage.vue',
  'reference/components/ModelSelector.vue',
  'guidance/component-contract.md',
  'guidance/AGENTS.snippet.md',
  'guidance/replication-evals.json',
  'guidance/source-design.md',
]

for (const relative of requiredOutput) {
  if (!fs.existsSync(path.join(outputRoot, relative))) {
    throw new Error(`Style pack export is incomplete: ${relative}`)
  }
}

const exportedTokens = fs.readFileSync(path.join(outputRoot, 'src/shared/styles/tokens.css'), 'utf8')
const canonicalTokens = fs.readFileSync(path.join(frontendRoot, 'src/shared/styles/tokens.css'), 'utf8')
if (exportedTokens !== canonicalTokens) throw new Error('Exported tokens.css drifted from canonical source')

const exportedBase = fs.readFileSync(path.join(outputRoot, 'src/shared/styles/base.css'), 'utf8')
const canonicalBase = fs.readFileSync(path.join(frontendRoot, 'src/shared/styles/base.css'), 'utf8')
if (exportedBase !== canonicalBase) throw new Error('Exported base.css drifted from canonical source')

const stableHooks = [
  '.dataagent-app',
  '.agent-chat__header',
  '.agent-chat__composer-wrap',
  '.agent-chat__composer',
  '.composer-input-actions',
  '.model-selector',
  '.message-bubble--user',
  '.attachment-chip',
  '.process-step__content',
]
const componentContract = fs.readFileSync(path.join(frontendRoot, 'style-pack/component-contract.md'), 'utf8')
for (const hook of stableHooks) {
  if (!canonicalBase.includes(hook)) throw new Error(`Stable style hook disappeared from base.css: ${hook}`)
  if (!componentContract.includes(hook)) throw new Error(`Stable style hook is undocumented in component-contract.md: ${hook}`)
}

const mainSource = fs.readFileSync(path.join(frontendRoot, 'src/main.ts'), 'utf8')
for (const requiredImport of [
  "element-plus/dist/index.css",
  "element-plus/theme-chalk/dark/css-vars.css",
  "./shared/styles/index.css",
  'initializeTheme()',
]) {
  if (!mainSource.includes(requiredImport)) throw new Error(`Style pack integration source is missing ${requiredImport}`)
}

const evals = JSON.parse(fs.readFileSync(path.join(frontendRoot, 'style-pack/replication-evals.json'), 'utf8'))
if (!Array.isArray(evals.scenarios) || evals.scenarios.length < 7) {
  throw new Error('Same-stack replication evals must keep at least seven fixed scenarios')
}

if (checkOnly) {
  fs.rmSync(outputRoot, { recursive: true, force: true })
  console.log('Same-stack style pack check passed: canonical styles, Vue references, hook contract, theme integration and evals export cleanly.')
} else {
  console.log(`Data Agent style pack exported to ${path.relative(repoRoot, outputRoot).replaceAll(path.sep, '/')}`)
}
