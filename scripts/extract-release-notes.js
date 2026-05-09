#!/usr/bin/env node

import { readFile } from 'node:fs/promises'

const version = process.argv[2]?.replace(/^v/, '')

if (!version) {
  console.error('Usage: node scripts/extract-release-notes.js <version>')
  process.exit(1)
}

const changelog = await readFile('CHANGELOG.md', 'utf8')
const headingPattern = new RegExp(`^## \\[${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\].*$`, 'm')
const match = headingPattern.exec(changelog)

if (!match) {
  console.log(`Installers and updater artifacts for Kessai ${version}.`)
  process.exit(0)
}

const sectionStart = match.index
const nextHeadingIndex = changelog.slice(sectionStart + match[0].length).search(/^## \[/m)
const sectionEnd =
  nextHeadingIndex === -1 ? changelog.length : sectionStart + match[0].length + nextHeadingIndex
const notes = changelog.slice(sectionStart + match[0].length, sectionEnd).trim()

console.log(notes || `Installers and updater artifacts for Kessai ${version}.`)
