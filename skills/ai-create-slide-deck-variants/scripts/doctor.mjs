#!/usr/bin/env node
// ai-create-slide-deck-variants doctor -- read-only Healthcheck.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { platform } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILL_DIR = path.resolve(__dirname, '..')
const TEMPLATES_DIR = path.join(SKILL_DIR, 'templates')
const VARIANTS_FILE = path.join(TEMPLATES_DIR, '_variants.json')

const checks = []
const ok   = (name, info) => checks.push({ name, status: 'OK',   info })
const warn = (name, info) => checks.push({ name, status: 'WARN', info })
const bad  = (name, info) => checks.push({ name, status: 'FAIL', info })

// 1. Node
{
  const v = process.versions.node
  const major = parseInt(v.split('.')[0], 10)
  if (major >= 18) ok('Node.js', `v${v} (>= v18)`)
  else bad('Node.js', `v${v} -- mind. v18 erforderlich`)
}

// 2. Wrapper
{
  const wp = path.join(SKILL_DIR, 'bin', 'pick-template.mjs')
  if (existsSync(wp)) ok('Wrapper', wp)
  else bad('Wrapper', `${wp} fehlt`)
}

// 3. Varianten-Index
let variants = null
{
  if (!existsSync(VARIANTS_FILE)) bad('_variants.json', `nicht gefunden: ${VARIANTS_FILE}`)
  else {
    try {
      variants = JSON.parse(readFileSync(VARIANTS_FILE, 'utf8')).variants
      if (Array.isArray(variants) && variants.length) ok('_variants.json', `${variants.length} Eintraege`)
      else bad('_variants.json', 'kein variants-Array oder leer')
    } catch (e) {
      bad('_variants.json', `Parse-Fehler: ${e.message}`)
    }
  }
}

// 4. Templates
if (variants) {
  const missing = []
  let available = 0
  for (const v of variants) {
    if (!v.available) continue
    available++
    if (!v.file || !existsSync(path.join(TEMPLATES_DIR, v.file))) missing.push(v.id)
  }
  if (missing.length === 0) ok('Vorlagen', `${available} verfuegbar`)
  else bad('Vorlagen', `fehlend: ${missing.join(', ')}`)

  // unaccounted-for HTML files in templates/
  const dirFiles = readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.html'))
  const referenced = new Set(variants.filter(v => v.file).map(v => v.file))
  const orphan = dirFiles.filter(f => !referenced.has(f))
  if (orphan.length) warn('Vorlagen-Verwaisste', `nicht in _variants.json: ${orphan.join(', ')}`)
}

// 5. Gate-Marker
{
  const installed = path.join(SKILL_DIR, 'SKILL_INSTALLED.md')
  const failed = path.join(SKILL_DIR, 'SKILL_INSTALL_FAILED.md')
  if (existsSync(installed)) ok('Gate', 'SKILL_INSTALLED.md vorhanden')
  else if (existsSync(failed)) warn('Gate', 'SKILL_INSTALL_FAILED.md vorhanden -- Preflight pruefen')
  else warn('Gate', 'kein Marker -- Preflight noch nicht gefahren')
}

const col = Math.max(...checks.map(c => c.name.length))
console.log()
console.log(`ai-create-slide-deck-variants doctor (Plattform: ${platform()})`)
console.log('-'.repeat(60))
for (const c of checks) {
  const tag = c.status === 'OK' ? '[OK]  ' : c.status === 'WARN' ? '[WARN]' : '[FAIL]'
  console.log(`${tag} ${c.name.padEnd(col)}  ${c.info ?? ''}`)
}
console.log()
const failedCount = checks.filter(c => c.status === 'FAIL').length
const warnCount = checks.filter(c => c.status === 'WARN').length
if (failedCount) { console.log(`${failedCount} Problem(e).`); process.exit(1) }
else if (warnCount) console.log(`${warnCount} Hinweis(e).`)
else console.log('Alles gruen.')
