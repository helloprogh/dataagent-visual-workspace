import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cssFiles = [
  path.join(root, 'src', 'high-contrast-text.css'),
  path.join(root, 'src', 'uiux-soft-technical-dark.css'),
]
const css = (await Promise.all(cssFiles.map(file => readFile(file, 'utf8')))).join('\n')

const lastMatch = (pattern) => {
  const matches = [...css.matchAll(pattern)]
  return matches.at(-1)
}

const variable = (name) => {
  const match = lastMatch(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`, 'g'))
  if (!match) throw new Error(`Missing contrast token ${name}`)
  return match[1]
}

const rgbaAlpha = (name) => {
  const match = lastMatch(new RegExp(`${name}\\s*:\\s*rgba\\([^,]+,[^,]+,[^,]+,\\s*([0-9.]+)\\)`, 'g'))
  if (!match) throw new Error(`Missing rgba token ${name}`)
  return Number(match[1])
}

const channel = (value) => {
  const normalized = value / 255
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}

const luminance = (hex) => {
  const value = hex.slice(1)
  const r = channel(Number.parseInt(value.slice(0, 2), 16))
  const g = channel(Number.parseInt(value.slice(2, 4), 16))
  const b = channel(Number.parseInt(value.slice(4, 6), 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (foreground, background) => {
  const a = luminance(foreground)
  const b = luminance(background)
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)
  return (lighter + 0.05) / (darker + 0.05)
}

const surfaces = [
  '--da-surface-0',
  '--da-surface-1',
  '--da-surface-2',
  '--da-surface-3',
  '--da-surface-4',
].map(variable)

const requirements = [
  ['--da-text-emphasis', 7],
  ['--da-text-primary', 7],
  ['--da-text-secondary', 7],
  ['--da-text-muted', 4.5],
  ['--da-text-subtle', 4.5],
  ['--da-accent-cyan', 4.5],
  ['--da-accent-blue', 4.5],
  ['--da-accent-green', 4.5],
  ['--da-accent-yellow', 4.5],
  ['--da-accent-red', 4.5],
]

const failures = []
for (const [name, minimum] of requirements) {
  const foreground = variable(name)
  const ratios = surfaces.map((background) => contrast(foreground, background))
  const lowest = Math.min(...ratios)
  if (lowest < minimum) {
    failures.push(`${name} minimum contrast ${lowest.toFixed(2)} is below ${minimum.toFixed(1)}`)
  }
}

const borderAlpha = rgbaAlpha('--da-border')
const strongBorderAlpha = rgbaAlpha('--da-border-strong')
if (borderAlpha < 0.16) failures.push(`--da-border alpha ${borderAlpha} is too faint; minimum is 0.16`)
if (strongBorderAlpha < 0.24) failures.push(`--da-border-strong alpha ${strongBorderAlpha} is too faint; minimum is 0.24`)

if (failures.length) {
  console.error('Visual contrast guard failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Visual contrast guard passed: final soft-dark tokens remain readable without relying on pure white.')
