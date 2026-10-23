#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const cargoCommand = process.platform === 'win32' ? 'cargo.exe' : 'cargo'
const smokePort = process.env.KESSAI_API_PORT ?? '3001'

let serverProcess = null
let tempDir = null

function isProcessRunning(childProcess) {
  return Boolean(childProcess && childProcess.exitCode === null && childProcess.signalCode === null)
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
      env: process.env,
      ...options,
    })

    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (signal) {
        resolve(1)
        return
      }

      resolve(code ?? 1)
    })
  })
}

async function cleanup() {
  if (isProcessRunning(serverProcess)) {
    try {
      serverProcess.kill('SIGTERM')
    } catch {
      // Ignore races where the child exits between the status check and kill call.
    }
  }

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true })
    tempDir = null
  }
}

async function main() {
  tempDir = await mkdtemp(join(tmpdir(), 'kessai-web-smoke-'))
  const dbPath = join(tempDir, 'kessai-smoke.db')

  console.log(`Using isolated smoke database at ${dbPath}`)

  const buildExitCode = await runCommand(pnpmCommand, ['build'])
  if (buildExitCode !== 0) {
    return buildExitCode
  }

  return await new Promise((resolve, reject) => {
    serverProcess = spawn(
      cargoCommand,
      [
        'run',
        '-p',
        'kessai-web',
        '--',
        '--dist-dir',
        'dist',
        '--port',
        smokePort,
        '--db-path',
        dbPath,
      ],
      {
        cwd: rootDir,
        stdio: 'inherit',
        env: process.env,
      }
    )

    serverProcess.on('error', reject)
    serverProcess.on('close', (code, signal) => {
      if (signal) {
        resolve(1)
        return
      }

      resolve(code ?? 1)
    })
  })
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await cleanup()
    process.exit(0)
  })
}

let exitCode = 1

try {
  exitCode = await main()
} finally {
  await cleanup()
}

process.exit(exitCode)
