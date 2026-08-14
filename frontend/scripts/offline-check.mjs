import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const src = path.join(root, 'src')
const errors = []
const exts = ['.ts', '.tsx', '.js', '.mjs', '.vue']

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}
function resolvesLocal(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec)
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return true
  return exts.some(ext => fs.existsSync(base + ext)) || exts.some(ext => fs.existsSync(path.join(base, 'index' + ext)))
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
for (const group of ['dependencies', 'devDependencies']) {
  for (const [name, version] of Object.entries(pkg[group] ?? {})) {
    if (version === 'latest' || String(version).includes('*')) errors.push(`${group}.${name} is not pinned: ${version}`)
  }
}

for (const file of walk(src)) {
  if (!/\.(ts|vue)$/.test(file)) continue
  const text = fs.readFileSync(file, 'utf8')
  if (file.endsWith('.vue')) {
    for (const tag of ['template']) {
      if (!text.includes(`<${tag}`) || !text.includes(`</${tag}>`)) errors.push(`${path.relative(root,file)} missing ${tag} block`)
    }
    if (text.includes('<script') && !text.includes('</script>')) errors.push(`${path.relative(root,file)} missing </script>`)
  }
  const importRe = /(?:from\s+|import\s+)["'](\.{1,2}\/[^"']+)["']/g
  for (const match of text.matchAll(importRe)) {
    if (!resolvesLocal(file, match[1])) errors.push(`${path.relative(root,file)} unresolved local import ${match[1]}`)
  }
}

if (errors.length) {
  console.error('Offline project checks failed:')
  for (const e of errors) console.error(' -', e)
  process.exit(1)
}
console.log('Offline project checks passed.')
console.log(`Checked ${walk(src).length} source files and pinned dependency declarations.`)
