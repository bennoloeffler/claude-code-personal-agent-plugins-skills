#!/usr/bin/env node
// ai-create-slide-deck-variants preflight core
// Voraussetzung: Node >= 18 (vorher per Bootstrap sichergestellt)
// Prueft Templates-Verzeichnis. Schreibt Marker. KEIN API-Key noetig.

import { writeFileSync, existsSync, readFileSync, unlinkSync, readdirSync } from 'node:fs'
import { platform, hostname, userInfo } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILL_DIR = path.resolve(__dirname, '..')
const TEMPLATES_DIR = path.join(SKILL_DIR, 'templates')
const VARIANTS_FILE = path.join(TEMPLATES_DIR, '_variants.json')
const INSTALLED = path.join(SKILL_DIR, 'SKILL_INSTALLED.md')
const FAILED = path.join(SKILL_DIR, 'SKILL_INSTALL_FAILED.md')
const SKILL_NAME = 'ai-create-slide-deck-variants'

const events = []
function log(level, msg) {
  events.push({ stamp: new Date().toISOString(), level, msg })
  const stream = level === 'error' ? process.stderr : process.stdout
  stream.write(`${msg}\n`)
}
const say  = (m) => log('info', m)
const step = (m) => log('info', `\n==> ${m}`)
const ok   = (m) => log('info', `    OK   ${m}`)
const fail = (m) => log('error', `    FAIL ${m}`)

const checks = []
function record(name, status, detail) { checks.push({ name, status, detail }) }

function checkNode() {
  step('Check 1/3: Node.js')
  const v = process.version
  const major = parseInt(v.replace(/^v/, '').split('.')[0], 10)
  if (major >= 18) { ok(`Node ${v} (>= v18)`); record('Node.js', 'ok', v); return true }
  fail(`Node ${v} ist zu alt -- mindestens v18 noetig.`)
  record('Node.js', 'fail', `${v}, mind. v18 erforderlich`)
  return false
}

function checkVariantsFile() {
  step('Check 2/3: Varianten-Index')
  if (!existsSync(VARIANTS_FILE)) {
    fail(`_variants.json fehlt: ${VARIANTS_FILE}`)
    record('Varianten-Index', 'fail', `Datei nicht gefunden: ${VARIANTS_FILE}`)
    return null
  }
  let data
  try { data = JSON.parse(readFileSync(VARIANTS_FILE, 'utf8')) }
  catch (err) {
    fail(`_variants.json nicht parsbar: ${err.message}`)
    record('Varianten-Index', 'fail', err.message)
    return null
  }
  if (!Array.isArray(data?.variants) || data.variants.length === 0) {
    fail('_variants.json hat kein variants-Array')
    record('Varianten-Index', 'fail', 'kein variants-Array')
    return null
  }
  ok(`${data.variants.length} Varianten im Index`)
  record('Varianten-Index', 'ok', `${data.variants.length} Varianten`)
  return data.variants
}

function checkTemplates(variants) {
  step('Check 3/3: Vorlagen-Dateien')
  if (!variants) {
    fail('uebersprungen (Index fehlt)')
    record('Vorlagen-Dateien', 'fail', 'Varianten-Index nicht ladbar')
    return false
  }
  const missing = []
  let availableCount = 0
  for (const v of variants) {
    if (!v.available) continue
    availableCount++
    if (!v.file) { missing.push(`${v.id}: file:null aber available:true`); continue }
    const fp = path.join(TEMPLATES_DIR, v.file)
    if (!existsSync(fp)) missing.push(`${v.id}: ${v.file} fehlt`)
  }
  if (missing.length > 0) {
    fail(`${missing.length} Vorlagen fehlen:`)
    for (const m of missing) log('error', `        ${m}`)
    record('Vorlagen-Dateien', 'fail', missing.join('; '))
    return false
  }
  // Sanity: tatsaechlich vorhandene Dateien im Verzeichnis
  const filesInDir = readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.html'))
  ok(`${availableCount} verfuegbare Varianten, ${filesInDir.length} HTML-Dateien im Templates-Ordner`)
  record('Vorlagen-Dateien', 'ok', `${availableCount} verfuegbar`)
  return true
}

say(`${SKILL_NAME} preflight (Plattform: ${platform()})`)
say(`Skill: ${SKILL_DIR}`)
say(`User: ${userInfo().username}@${hostname()}`)

if (existsSync(FAILED)) { try { unlinkSync(FAILED) } catch {} }

const nodeOk = checkNode()
const variants = checkVariantsFile()
const templatesOk = checkTemplates(variants)

const allOk = nodeOk && variants && templatesOk

const summary = checks.map(c => `- **${c.name}** — ${c.status === 'ok' ? 'OK' : 'FAIL'}: ${c.detail}`).join('\n')
const fullLog = events.map(e => `- [${e.stamp}] ${e.level.toUpperCase()}: ${e.msg.replace(/\n/g, ' ').trim()}`).join('\n')
const meta = [
  `**Skill:** ${SKILL_NAME}`,
  `**Geschrieben:** ${new Date().toISOString()}`,
  `**Plattform:** ${platform()}`,
  `**Node:** ${process.version}`,
  `**Host:** ${userInfo().username}@${hostname()}`,
  `**Skill-Ordner:** ${SKILL_DIR}`,
].join('\n')

if (allOk) {
  writeFileSync(INSTALLED, `# ${SKILL_NAME}: SKILL_INSTALLED

${meta}

## Status: OK

Skill ist einsatzbereit. Keine externen API-Keys noetig, alle Vorlagen vorhanden.

## Checks

${summary}

## Preflight-Log

${fullLog}

---
Bei Aktualisierung des Templates-Ordners diese Datei loeschen, dann startet der Preflight neu.
`)
  say(`\nFertig. SKILL_INSTALLED.md geschrieben.`)
  process.exit(0)
} else {
  const failedItems = checks.filter(c => c.status === 'fail')
  const remediation = failedItems.map(c => `### ${c.name}\n\n${c.detail}\n`).join('\n')
  writeFileSync(FAILED, `# ${SKILL_NAME}: SKILL_INSTALL_FAILED

${meta}

## Status: FAILED

${failedItems.length} von ${checks.length} Checks fehlgeschlagen.

## Checks

${summary}

## Was zu tun ist

${remediation}

## Preflight-Log

${fullLog}

---
Nach Behebung: diese Datei loeschen und Preflight erneut starten:
\`bash "${SKILL_DIR}/scripts/preflight.sh"\`
`)
  log('error', `\nPreflight FEHLGESCHLAGEN. Details in ${FAILED}`)
  process.exit(1)
}
