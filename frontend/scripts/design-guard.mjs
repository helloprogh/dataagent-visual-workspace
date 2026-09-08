import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(frontendRoot, '..')
const srcRoot = path.join(frontendRoot, 'src')
const tokensPath = path.join(srcRoot, 'shared', 'styles', 'tokens.css')
const styleIndexPath = path.join(srcRoot, 'shared', 'styles', 'index.css')
const designPath = path.join(repoRoot, 'design.md')
const scenariosPath = path.join(frontendRoot, 'design-evals', 'scenarios.json')

const errors = []

function read(file) {
  return fs.readFileSync(file, 'utf8')
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

function relative(file) {
  return path.relative(repoRoot, file).replaceAll(path.sep, '/')
}

for (const required of [designPath, tokensPath, styleIndexPath, scenariosPath]) {
  if (!fs.existsSync(required)) errors.push(`Missing required design-system file: ${relative(required)}`)
}

if (errors.length === 0) {
  const design = read(designPath)
  for (const marker of [
    '## 1. Reader job before visual treatment',
    '## 4. Bounded visual vocabulary',
    '## 9. Named failure modes',
    '## 10. Evaluation loop',
    'frontend/design-evals/scenarios.json',
    'frontend/src/shared/styles/tokens.css',
  ]) {
    if (!design.includes(marker)) errors.push(`design.md is missing required guidance marker: ${marker}`)
  }

  const styleIndex = read(styleIndexPath)
  const tokensIndex = styleIndex.indexOf("@import './tokens.css';")
  const baseIndex = styleIndex.indexOf("@import './base.css';")
  const appIndex = styleIndex.indexOf("@import './app.css';")
  if (tokensIndex < 0 || baseIndex < 0 || appIndex < 0 || !(tokensIndex < baseIndex && baseIndex < appIndex)) {
    errors.push('Shared style load order must remain tokens.css -> base.css -> app.css')
  }

  const tokens = read(tokensPath)
  if (!tokens.includes(':root {') || !tokens.includes(":root[data-theme='light']")) {
    errors.push('tokens.css must define the default theme and a light-theme override')
  }

  const declaredTokens = new Set([...tokens.matchAll(/(--da-[a-z0-9-]+)\s*:/gi)].map(match => match[1]))
  const requiredTokens = [
    '--da-text-primary',
    '--da-text-secondary',
    '--da-surface-0',
    '--da-surface-2',
    '--da-border',
    '--da-border-focus',
    '--da-accent-primary',
    '--da-bubble-user-bg',
    '--da-space-4',
    '--da-radius-lg',
    '--da-focus-outline',
    '--da-motion-fast',
  ]
  for (const token of requiredTokens) {
    if (!declaredTokens.has(token)) errors.push(`Missing canonical design token ${token}`)
  }

  const canonicalPrefixes = [
    '--da-text-', '--da-surface-', '--da-border', '--da-accent-', '--da-brand-', '--da-bubble-',
    '--da-font-', '--da-space-', '--da-radius-', '--da-sidebar-', '--da-content-', '--da-ring-',
    '--da-focus-', '--da-shadow-', '--da-gradient-', '--da-motion-', '--da-ease-', '--da-ambient',
  ]

  for (const file of walk(srcRoot)) {
    if (!/\.(css|vue|ts)$/.test(file)) continue
    const text = read(file)

    for (const match of text.matchAll(/var\((--da-[a-z0-9-]+)/gi)) {
      if (!declaredTokens.has(match[1])) {
        errors.push(`${relative(file)} references undefined design token ${match[1]}`)
      }
    }

    if (file === tokensPath) continue
    for (const match of text.matchAll(/(--da-[a-z0-9-]+)\s*:/gi)) {
      if (canonicalPrefixes.some(prefix => match[1].startsWith(prefix))) {
        errors.push(`${relative(file)} redefines canonical token ${match[1]}; define shared --da-* tokens only in tokens.css`)
      }
    }
  }

  let scenarios
  try {
    scenarios = JSON.parse(read(scenariosPath))
  } catch (error) {
    errors.push(`Unable to parse design-evals/scenarios.json: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (scenarios) {
    if (!Array.isArray(scenarios.scenarios) || scenarios.scenarios.length < 7) {
      errors.push('Design eval manifest must keep at least seven frozen scenarios')
    } else {
      const ids = new Set()
      for (const scenario of scenarios.scenarios) {
        if (!scenario?.id || !scenario?.surface || !scenario?.task || !scenario?.viewport || !scenario?.theme) {
          errors.push('Every design eval scenario needs id, surface, task, viewport and theme')
          continue
        }
        if (ids.has(scenario.id)) errors.push(`Duplicate design eval scenario id: ${scenario.id}`)
        ids.add(scenario.id)
        if (!Array.isArray(scenario.review) || scenario.review.length === 0) {
          errors.push(`Design eval ${scenario.id} needs human review dimensions`)
        }
        if (!Array.isArray(scenario.mustAvoid) || scenario.mustAvoid.length === 0) {
          errors.push(`Design eval ${scenario.id} needs named failure modes to avoid`)
        }
      }
    }
  }
}

if (errors.length) {
  console.error('Design guard failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('Design guard passed: guidance, frozen evals, style order and canonical token ownership are consistent.')
