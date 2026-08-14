import dns from 'node:dns/promises'
import https from 'node:https'

const registry = (process.env.npm_config_registry || 'https://registry.npmjs.org/').replace(/\/$/, '')
const host = new URL(registry).hostname
console.log(`Node: ${process.version}`)
console.log(`Registry: ${registry}`)
console.log(`HTTP_PROXY: ${process.env.HTTP_PROXY || process.env.http_proxy || '(not set)'}`)
console.log(`HTTPS_PROXY: ${process.env.HTTPS_PROXY || process.env.https_proxy || '(not set)'}`)

try {
  const addresses = await dns.lookup(host, { all: true })
  console.log(`DNS: OK (${addresses.slice(0,4).map(v => v.address).join(', ')})`)
} catch (e) {
  console.error(`DNS: FAILED (${e.code || e.message})`)
  process.exitCode = 2
}

await new Promise(resolve => {
  const req = https.get(`${registry}/-/ping`, { timeout: 12000 }, res => {
    console.log(`HTTPS: ${res.statusCode} ${res.statusMessage || ''}`.trim())
    res.resume(); res.on('end', resolve)
  })
  req.on('timeout', () => { console.error('HTTPS: TIMEOUT'); req.destroy(); resolve() })
  req.on('error', err => { console.error(`HTTPS: FAILED (${err.code || err.message})`); resolve() })
})
