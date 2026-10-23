#!/usr/bin/env node

import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const indexPath = join(rootDir, 'dist', 'index.html')
const tauriConfigPath = join(rootDir, 'src-tauri', 'tauri.conf.json')

function fail(message) {
  console.error(`Web resource verification failed: ${message}`)
  process.exit(1)
}

try {
  if (!statSync(indexPath).isFile()) {
    fail('dist/index.html is not a file. Run `pnpm build` before building Tauri.')
  }
} catch {
  fail('dist/index.html is missing. Run `pnpm build` before building Tauri.')
}

let tauriConfig
try {
  tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'))
} catch (error) {
  fail(`could not read ${tauriConfigPath}: ${error.message}`)
}

if (tauriConfig.bundle?.resources?.['../dist/'] !== 'dist/') {
  fail("src-tauri/tauri.conf.json must map '../dist/' to 'dist/' in bundle.resources.")
}

console.log('Web resource verification passed.')
