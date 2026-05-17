#!/usr/bin/env node
// ai-create-image doctor -- read-only Healthcheck (schreibt keine Marker).

import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir, platform } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILL_DIR = path.resolve(__dirname, '..')

const checks = []
function ok(name, info)   { checks.push({ name, status: 'OK',   info }) }
function warn(name, info) { checks.push({ name, status: 'WARN', info }) }
function bad(name, info)  { checks.push({ name, status: 'FAIL', info }) }

// 1. Node version
{
  const v = process.versions.node
  const major = parseInt(v.split('.')[0], 10)
  if (major >= 18) ok('Node.js', `v${v} (>= v18)`)
  else bad('Node.js', `v${v} -- mind. v18 erforderlich`)
}

// 2. API key
function parseEnvFile(p) {
  if (!existsSync(p)) return {}
  const out = {}
  for (const raw of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[m[1]] = v
  }
  return out
}
const isPlaceholder = (k) => !k || /^(REPLACE_ME|TODO|XXX|<.*>)/i.test(k) || k.length < 10
{
  const overridePath = path.join(homedir(), '.claude', '.env', 'ai-create-image.env')
  const defaultPath  = path.join(SKILL_DIR, 'config', 'secrets.default.env')
  const o = parseEnvFile(overridePath).OPENAI_API_KEY
  const d = parseEnvFile(defaultPath).OPENAI_API_KEY
  const e = process.env.OPENAI_API_KEY
  if (o && !isPlaceholder(o)) ok('OPENAI_API_KEY', `${overridePath} (Override)`)
  else if (d && !isPlaceholder(d)) ok('OPENAI_API_KEY', `${defaultPath} (shipped default)`)
  else if (e && !isPlaceholder(e)) ok('OPENAI_API_KEY', `Umgebungsvariable`)
  else if (d && isPlaceholder(d)) warn('OPENAI_API_KEY', `Default-Key ist Platzhalter -- ~/.claude/.env/ai-create-image.env anlegen`)
  else bad('OPENAI_API_KEY', `nicht gesetzt`)
}

// 3. tmp writable
{
  try {
    const dir = mkdtempSync(path.join(tmpdir(), 'ai-create-image-doctor-'))
    writeFileSync(path.join(dir, 'probe.txt'), 'ok')
    rmSync(dir, { recursive: true, force: true })
    ok('TMP schreibbar', tmpdir())
  } catch (err) {
    bad('TMP schreibbar', err.message)
  }
}

// 4. Wrapper present
{
  const wrapper = path.join(SKILL_DIR, 'bin', 'create-image.mjs')
  if (existsSync(wrapper)) ok('Wrapper', wrapper)
  else bad('Wrapper', `${wrapper} fehlt`)
}

// 5. Gate-Marker
{
  const installed = path.join(SKILL_DIR, 'SKILL_INSTALLED.md')
  const failed = path.join(SKILL_DIR, 'SKILL_INSTALL_FAILED.md')
  if (existsSync(installed)) ok('Gate', 'SKILL_INSTALLED.md vorhanden')
  else if (existsSync(failed)) warn('Gate', 'SKILL_INSTALL_FAILED.md vorhanden -- Preflight pruefen')
  else warn('Gate', 'kein Marker -- Preflight wurde noch nicht gefahren')
}

const col = Math.max(...checks.map(c => c.name.length))
console.log()
console.log(`ai-create-image doctor (Plattform: ${platform()})`)
console.log('-'.repeat(60))
for (const c of checks) {
  const tag = c.status === 'OK' ? '[OK]  ' : c.status === 'WARN' ? '[WARN]' : '[FAIL]'
  console.log(`${tag} ${c.name.padEnd(col)}  ${c.info ?? ''}`)
}
console.log()
const failed = checks.filter(c => c.status === 'FAIL').length
const warned = checks.filter(c => c.status === 'WARN').length
if (failed) {
  console.log(`${failed} Problem(e) -- Skill ist NICHT einsatzbereit.`)
  process.exit(1)
} else if (warned) {
  console.log(`${warned} Hinweis(e) -- Skill funktioniert moeglich, aber bitte beachten.`)
} else {
  console.log('Alles gruen.')
}
