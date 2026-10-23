#!/usr/bin/env node

/** Sync user-facing package versions from package.json. */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
export const manifests = [
  ['src-tauri/Cargo.toml', 'kessai'],
  ['crates/kessai-mcp/Cargo.toml', 'kessai-mcp'],
  ['crates/kessai-web/Cargo.toml', 'kessai-web'],
]

function packageVersionMatch(source) {
  const heading = /^\[package\][ \t]*(?:#[^\r\n]*)?\r?$/m.exec(source)
  if (!heading) throw new Error('No [package] section found')
  const start = heading.index + heading[0].length
  const rest = source.slice(start)
  const nextSection = /^[ \t]*\[/m.exec(rest)
  const section = rest.slice(0, nextSection?.index ?? rest.length)
  const version = /^([ \t]*version[ \t]*=[ \t]*)"([^"]+)"/m.exec(section)
  if (!version) throw new Error('No explicit [package] version found')
  return { version: version[2], start: start + version.index + version[1].length + 1 }
}

export function packageVersion(source) {
  return packageVersionMatch(source).version
}

export function replacePackageVersion(source, version) {
  const match = packageVersionMatch(source)
  return source.slice(0, match.start) + version + source.slice(match.start + match.version.length)
}

export function syncVersions(directory = rootDir) {
  const packageJson = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
  const version = packageJson.version
  const tauriConfPath = join(directory, 'src-tauri/tauri.conf.json')
  const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf8'))
  if (tauriConf.version !== version) {
    tauriConf.version = version
    writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n')
  }

  for (const [relativePath] of manifests) {
    const path = join(directory, relativePath)
    const source = readFileSync(path, 'utf8')
    const updated = replacePackageVersion(source, version)
    if (updated !== source) writeFileSync(path, updated)
  }

  const cargoLockPath = join(directory, 'Cargo.lock')
  const source = readFileSync(cargoLockPath, 'utf8')
  let cargoLock = source
  for (const [, packageName] of manifests) {
    const pattern = new RegExp(
      `(\\[\\[package\\]\\]\\r?\\nname = "${packageName}"\\r?\\nversion = ")[^"]+("\\r?\\n)`
    )
    if (!pattern.test(cargoLock)) {
      throw new Error(`No Cargo.lock package entry found for ${packageName}`)
    }
    cargoLock = cargoLock.replace(pattern, `$1${version}$2`)
  }
  if (cargoLock !== source) writeFileSync(cargoLockPath, cargoLock)
  console.log(`User-facing versions synchronized to ${version}.`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  syncVersions()
}
