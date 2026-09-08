import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const css = await readFile(path.join(root, 'src', 'shared', 'styles', 'tokens.css'), 'utf8')

function block(pattern, label) {
  const match = css.match(pattern)
  if (!match) throw new Error(`Missing ${label} token block`)
  return match[1]
}

function variables(source) {
  return new Map([...source.matchAll(/(--da-[a-z0-9-]+)\s*:\s*(#[0-9a-f]{6})\s*;/gi)].map(match => [match[1], match[2]]))
}

const dark = variables(block(/:root\s*\{([\s\S]*?)\n\}/, 'default theme'))
const light = variables(block(/:root\[data-theme=['"]light['"]\]\s*\{([\s\S]*?)\n\}/, 'light theme'))

function channel(value) {
  const normalized = value / 255
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}

function luminance(hex) {
  const value = hex.slice(1)
  const r = channel(Number.parseInt(value.slice(0, 2), 16))
  const g = channel(Number.parseInt(value.slice(2, 4), 16))
  const b = channel(Number.parseInt(value.slice(4, 6), 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(foreground, background) {
  const a = luminance(foreground)
  const b = luminance(background)
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)
  return (lighter + 0.05) / (darker + 0.05)
}

const requirements = [
  ['--da-text-emphasis', 7],
  ['--da-text-primary', 7],
  ['--da-text-secondary', 4.5],
]
const surfaceNames = ['--da-surface-0', '--da-surface-1', '--da-surface-2', '--da-surface-3', '--da-surface-4']
const failures = []

for (const [themeName, theme] of [['dark', dark], ['light', light]]) {
  const surfaces = surfaceNames.map(name => {
    const value = theme.get(name)
    if (!value) failures.push(`${themeName}: missing direct hex token ${name}`)
    return value
  }).filter(Boolean)

  for (const [name, minimum] of requirements) {
    const foreground = theme.get(name)
    if (!foreground) {
      failures.push(`${themeName}: missing direct hex token ${name}`)
      continue
    }
    if (surfaces.length !== surfaceNames.length) continue
    const lowest = Math.min(...surfaces.map(background => contrast(foreground, background)))
    if (lowest < minimum) {
      failures.push(`${themeName}: ${name} minimum contrast ${lowest.toFixed(2)} is below ${minimum.toFixed(1)}`)
    }
  }
}

if (failures.length) {
  console.error('Visual contrast guard failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Visual contrast guard passed for emphasis, primary and secondary text across shared dark/light surfaces.')
