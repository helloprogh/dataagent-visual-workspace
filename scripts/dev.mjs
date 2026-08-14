import { spawn } from 'node:child_process'

const demo = process.argv.includes('--demo')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const children = [
  spawn(npmCommand, ['run', 'dev', '-w', 'adapter'], { stdio: 'inherit' }),
  spawn(npmCommand, ['run', demo ? 'dev:demo' : 'dev', '-w', 'frontend'], {
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
