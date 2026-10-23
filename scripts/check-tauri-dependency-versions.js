import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pairs = [
  ['@tauri-apps/api', 'tauri'],
  ['@tauri-apps/plugin-autostart', 'tauri-plugin-autostart'],
  ['@tauri-apps/plugin-dialog', 'tauri-plugin-dialog'],
  ['@tauri-apps/plugin-fs', 'tauri-plugin-fs'],
  ['@tauri-apps/plugin-notification', 'tauri-plugin-notification'],
  ['@tauri-apps/plugin-process', 'tauri-plugin-process'],
  ['@tauri-apps/plugin-updater', 'tauri-plugin-updater'],
]

function majorMinor(version) {
  const match = /^(\d+)\.(\d+)/.exec(version)
  if (!match) {
    throw new Error(`could not parse package version: ${version}`)
  }
  return `${match[1]}.${match[2]}`
}

function readCargoLockVersions() {
  const lock = fs.readFileSync(path.join(repoRoot, 'Cargo.lock'), 'utf8')
  const versions = new Map()

  for (const block of lock.split('[[package]]').slice(1)) {
    const name = /^name = "([^"]+)"/m.exec(block)?.[1]
    const version = /^version = "([^"]+)"/m.exec(block)?.[1]
    if (!name || !version) continue
    const entries = versions.get(name) ?? []
    entries.push(version)
    versions.set(name, entries)
  }

  return versions
}

const [pnpmProject] = JSON.parse(
  execFileSync('pnpm', ['list', '--depth', '0', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
)
const cargoVersions = readCargoLockVersions()
const failures = []
const aligned = []

for (const [npmName, cargoName] of pairs) {
  const npmVersion = pnpmProject.dependencies?.[npmName]?.version
  const matchingCargoVersions = cargoVersions.get(cargoName) ?? []

  if (!npmVersion || matchingCargoVersions.length !== 1) {
    failures.push(
      `${npmName} / ${cargoName}: expected one installed JavaScript and one locked Rust version`
    )
    continue
  }

  const [cargoVersion] = matchingCargoVersions
  if (majorMinor(npmVersion) !== majorMinor(cargoVersion)) {
    failures.push(`${npmName} ${npmVersion} does not match ${cargoName} ${cargoVersion}`)
    continue
  }

  aligned.push(`${npmName} ${npmVersion} ↔ ${cargoName} ${cargoVersion}`)
}

if (failures.length > 0) {
  console.error('Tauri JavaScript/Rust package versions are misaligned:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Tauri JavaScript/Rust package versions are aligned:')
for (const pair of aligned) console.log(`- ${pair}`)
