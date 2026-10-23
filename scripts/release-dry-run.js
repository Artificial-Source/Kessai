#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { manifests, packageVersion, replacePackageVersion, syncVersions } from './sync-versions.js'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const managedFiles = [
  'package.json',
  'src-tauri/tauri.conf.json',
  ...manifests.map(([path]) => path),
  'Cargo.lock',
  'CHANGELOG.md',
]

async function verifyVersions(tag, directory = rootDir) {
  const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
  assert.match(tag, /^v\d+\.\d+\.\d+$/, 'A stable release tag vX.Y.Z is required')
  assert.equal(tag, `v${pkg.version}`, 'Tag and package.json versions differ')
  const tauri = JSON.parse(await readFile(join(directory, 'src-tauri/tauri.conf.json'), 'utf8'))
  assert.equal(tauri.version, pkg.version, 'Tauri config version differs')
  const lock = await readFile(join(directory, 'Cargo.lock'), 'utf8')
  for (const [path, name] of manifests) {
    assert.equal(packageVersion(await readFile(join(directory, path), 'utf8')), pkg.version, path)
    const entry = lock
      .split(/^\[\[package\]\]/m)
      .find((section) => new RegExp(`^name = "${name}"\\r?$`, 'm').test(section))
    assert.ok(entry, `Missing Cargo.lock entry: ${name}`)
    assert.equal(/^version = "([^"]+)"/m.exec(entry)?.[1], pkg.version, `Cargo.lock: ${name}`)
  }
  const changelog = await readFile(join(directory, 'CHANGELOG.md'), 'utf8')
  assert.ok(
    changelog.split('\n').some((line) => line.startsWith(`## [${pkg.version}]`)),
    `Missing changelog section for ${pkg.version}`
  )
  return pkg.version
}

function inventory(version) {
  const desktop = [
    `Kessai_${version}_amd64.AppImage`,
    `Kessai_${version}_amd64.deb`,
    `Kessai-${version}-1.x86_64.rpm`,
    `Kessai_${version}_x64-setup.exe`,
    `Kessai_${version}_x64_en-US.msi`,
    `Kessai_${version}_x64.dmg`,
    `Kessai_${version}_aarch64.dmg`,
    'Kessai_x64.app.tar.gz',
    'Kessai_aarch64.app.tar.gz',
  ]
  const mcp = [
    'x86_64-unknown-linux-gnu.tar.gz',
    'x86_64-pc-windows-msvc.zip',
    'x86_64-apple-darwin.tar.gz',
    'aarch64-apple-darwin.tar.gz',
  ].map((target) => `kessai-mcp-${version}-${target}`)
  const signed = desktop.filter((name) => !name.endsWith('.dmg'))
  const binaries = [...desktop, ...mcp]
  return {
    desktop,
    binaries,
    signed,
    all: [
      ...binaries,
      ...binaries.map((name) => `${name}.sha256`),
      ...signed.map((name) => `${name}.sig`),
      'latest.json',
    ],
  }
}

async function digest(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function desktopChecksums(directory, version) {
  for (const name of inventory(version).desktop) {
    const hash = await digest(join(directory, name))
    await writeFile(join(directory, `${name}.sha256`), `${hash}  ${name}\n`)
  }
}

async function verifyArtifacts(directory, version, repository) {
  const expected = inventory(version)
  assert.deepEqual(
    (await readdir(directory)).sort(),
    [...expected.all].sort(),
    'Release artifact inventory is incomplete or contains unexpected assets'
  )
  for (const name of expected.all) {
    const info = await stat(join(directory, name))
    assert.ok(info.isFile() && info.size > 0, `Empty or invalid release asset: ${name}`)
  }
  for (const name of expected.binaries) {
    const checksum = (await readFile(join(directory, `${name}.sha256`), 'utf8')).trim()
    assert.equal(checksum, `${await digest(join(directory, name))}  ${name}`, `Checksum: ${name}`)
  }
  const updater = JSON.parse(await readFile(join(directory, 'latest.json'), 'utf8'))
  assert.equal(updater.version, version, 'Updater manifest version differs')
  const platforms = {
    'linux-x86_64': `Kessai_${version}_amd64.AppImage`,
    'darwin-x86_64': 'Kessai_x64.app.tar.gz',
    'darwin-aarch64': 'Kessai_aarch64.app.tar.gz',
    'windows-x86_64': `Kessai_${version}_x64_en-US.msi`,
  }
  for (const [platform, name] of Object.entries(platforms)) {
    assert.equal(
      updater.platforms?.[platform]?.url,
      `https://github.com/${repository}/releases/download/v${version}/${name}`,
      platform
    )
  }
  for (const [platform, entry] of Object.entries(updater.platforms)) {
    const prefix = `https://github.com/${repository}/releases/download/v${version}/`
    assert.ok(entry.url.startsWith(prefix), `Wrong updater URL: ${platform}`)
    const name = entry.url.slice(prefix.length)
    assert.ok(expected.signed.includes(name), `Unknown updater artifact: ${platform}`)
    const signature = (await readFile(join(directory, `${name}.sig`), 'utf8')).trim()
    assert.ok(signature.length > 0, `Empty signature: ${name}`)
    assert.equal(entry.signature, signature, `Updater signature mismatch: ${platform}`)
  }
}

async function selfTest() {
  const source =
    '[dependencies.example]\nversion = "7.0.0"\n[package]\nname = "sample"\nversion = "0.1.0" # keep comment\n[package.metadata]\nversion = "8.0.0"\n'
  const updated = replacePackageVersion(source, '1.2.3')
  assert.equal(updated, source.replace('"0.1.0"', '"1.2.3"'))
  assert.equal(packageVersion(updated), '1.2.3')
  assert.equal(packageVersion(updated.replaceAll('\n', '\r\n')), '1.2.3')
  assert.throws(() => replacePackageVersion('[dependencies.example]\nversion = "1"\n', '2'))
  assert.throws(() =>
    replacePackageVersion(
      '[package]\nname = "sample"\n[dependencies.example]\nversion = "1"\n',
      '2'
    )
  )
  const temporary = await mkdtemp(join(tmpdir(), 'kessai-release-check-'))
  try {
    await mkdir(join(temporary, 'src-tauri'), { recursive: true })
    await writeFile(join(temporary, 'package.json'), '{"version":"1.2.3"}')
    await writeFile(join(temporary, 'src-tauri/tauri.conf.json'), '{"version":"0.1.0"}')
    await writeFile(join(temporary, 'CHANGELOG.md'), '## [1.2.3]\nRelease notes\n')
    const notesScript = join(rootDir, 'scripts/extract-release-notes.js')
    const notesOptions = { cwd: temporary, encoding: 'utf8', stdio: 'pipe' }
    assert.equal(
      execFileSync(process.execPath, [notesScript, 'v1.2.3'], notesOptions).trim(),
      'Release notes'
    )
    assert.throws(() => execFileSync(process.execPath, [notesScript, 'v9.9.9'], notesOptions))
    for (const [path] of manifests) {
      await mkdir(dirname(join(temporary, path)), { recursive: true })
      await writeFile(join(temporary, path), source)
    }
    await writeFile(
      join(temporary, 'Cargo.lock'),
      manifests.map(([, name]) => `[[package]]\nname = "${name}"\nversion = "0.1.0"\n`).join('\n')
    )
    syncVersions(temporary)
    assert.equal(await verifyVersions('v1.2.3', temporary), '1.2.3')
    await assert.rejects(verifyVersions('v1.2.4', temporary), /versions differ/)
    const assets = join(temporary, 'assets')
    await mkdir(assets)
    const expected = inventory('1.2.3')
    for (const name of expected.binaries) {
      await writeFile(join(assets, name), `fixture ${name}\n`)
      await writeFile(
        join(assets, `${name}.sha256`),
        `${await digest(join(assets, name))}  ${name}\n`
      )
    }
    for (const name of expected.signed)
      await writeFile(join(assets, `${name}.sig`), 'fixture-signature\n')
    const updater = { version: '1.2.3', platforms: {} }
    for (const [platform, name] of Object.entries({
      'linux-x86_64': 'Kessai_1.2.3_amd64.AppImage',
      'darwin-x86_64': 'Kessai_x64.app.tar.gz',
      'darwin-aarch64': 'Kessai_aarch64.app.tar.gz',
      'windows-x86_64': 'Kessai_1.2.3_x64_en-US.msi',
    }))
      updater.platforms[platform] = {
        signature: 'fixture-signature',
        url: `https://github.com/Artificial-Source/Kessai/releases/download/v1.2.3/${name}`,
      }
    const manifestPath = join(assets, 'latest.json')
    await writeFile(manifestPath, JSON.stringify(updater))
    // Exercise the same desktop-sidecar generation used immediately before publication.
    for (const name of expected.desktop) await rm(join(assets, `${name}.sha256`))
    await desktopChecksums(assets, '1.2.3')
    await verifyArtifacts(assets, '1.2.3', 'Artificial-Source/Kessai')
    // Every individual missing binary, checksum, signature or manifest must block publication.
    for (const name of expected.all) {
      const path = join(assets, name)
      const bytes = await readFile(path)
      await rm(path)
      await assert.rejects(
        verifyArtifacts(assets, '1.2.3', 'Artificial-Source/Kessai'),
        /inventory/
      )
      await writeFile(path, bytes)
    }
    updater.platforms['darwin-aarch64'].signature = 'wrong-signature'
    await writeFile(manifestPath, JSON.stringify(updater))
    await assert.rejects(
      verifyArtifacts(assets, '1.2.3', 'Artificial-Source/Kessai'),
      /signature mismatch/
    )
    updater.platforms['darwin-aarch64'].signature = 'fixture-signature'
    updater.version = '9.9.9'
    await writeFile(manifestPath, JSON.stringify(updater))
    await assert.rejects(
      verifyArtifacts(assets, '1.2.3', 'Artificial-Source/Kessai'),
      /version differs/
    )
    await writeFile(join(assets, expected.binaries[0]), 'truncated')
    await assert.rejects(verifyArtifacts(assets, '1.2.3', 'Artificial-Source/Kessai'), /Checksum/)
    console.log(`Release regression checks passed (${expected.all.length} missing-asset cases).`)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

async function releaseDryRun() {
  // Check before taking snapshots: never overwrite another contributor's dirty tree.
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: rootDir, encoding: 'utf8' })
  if (status.trim()) {
    throw new Error('Release dry-run requires a clean tree; use --check for read-only preflight')
  }
  const snapshot = new Map(
    await Promise.all(
      managedFiles.map(async (path) => [
        join(rootDir, path),
        await readFile(join(rootDir, path), 'utf8'),
      ])
    )
  )
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(pnpmCommand, ['exec', 'release-it', '--ci', '--dry-run'], {
        cwd: rootDir,
        stdio: 'inherit',
        env: process.env,
      })
      child.on('error', reject)
      child.on('close', (code) => resolve(code ?? 1))
    })
  } finally {
    await Promise.all([...snapshot].map(([path, contents]) => writeFile(path, contents)))
    console.log('Restored release-managed files after dry-run.')
  }
}

try {
  const [mode, argument, tag] = process.argv.slice(2)
  if (mode === '--self-test') {
    await selfTest()
  } else if (mode === '--check') {
    await selfTest()
    const version = JSON.parse(await readFile(join(rootDir, 'package.json'), 'utf8')).version
    await verifyVersions(argument ?? `v${version}`)
    console.log('Release version and changelog preflight passed.')
  } else if (mode === '--desktop-checksums' || mode === '--verify-artifacts') {
    assert.ok(argument && tag, `Usage: ${mode} <asset-directory> <tag>`)
    const version = await verifyVersions(tag)
    if (mode === '--desktop-checksums') await desktopChecksums(argument, version)
    else
      await verifyArtifacts(
        argument,
        version,
        process.env.GITHUB_REPOSITORY ?? 'Artificial-Source/Kessai'
      )
    console.log(`${mode} passed.`)
  } else {
    assert.equal(mode, undefined, `Unknown argument: ${mode}`)
    await selfTest()
    process.exitCode = await releaseDryRun()
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
