import { spawn } from 'node:child_process'

const demo = process.argv.includes('--demo')
const scenario = process.argv.includes('--scenario')
const isWindows = process.platform === 'win32'
const npmCommand = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'npm'
const npmArgs = (args) => isWindows ? ['/d', '/s', '/c', 'npm', ...args] : args
const children = [
  spawn(npmCommand, npmArgs(['run', 'dev', '-w', 'adapter']), { stdio: 'inherit' }),
  spawn(npmCommand, npmArgs(['run', scenario ? 'dev:scenario' : demo ? 'dev:demo' : 'dev', '-w', 'frontend']), {
    stdio: 'inherit',
  }),
]

const stop = () => {
  for (const child of children) child.kill()
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)

const [first] = await Promise.race(
  children.map((child) => new Promise((resolve) => child.on('exit', (code) => resolve([code])))),
)
stop()
process.exitCode = first ?? 0
