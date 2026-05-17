#!/usr/bin/env node
// ai-create-image-set preflight core
// Voraussetzung: Node >= 18 (vorher per Bootstrap sichergestellt)
// Prueft API-Key (inkl. Live-Validierung gegen /v1/models). Schreibt Marker.

import { writeFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs'
import { homedir, platform, hostname, userInfo } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILL_DIR = path.resolve(__dirname, '..')
const INSTALLED = path.join(SKILL_DIR, 'SKILL_INSTALLED.md')
const FAILED = path.join(SKILL_DIR, 'SKILL_INSTALL_FAILED.md')
const SKILL_NAME = 'ai-create-image-set'

const events = []
function log(level, msg) {
  events.push({ stamp: new Date().toISOString(), level, msg })
  const stream = level === 'error' ? process.stderr : process.stdout
  stream.write(`${msg}\n`)
}
const say  = (m) => log('info', m)
const step = (m) => log('info', `\n==> ${m}`)
const ok   = (m) => log('info', `    OK   ${m}`)
const warn = (m) => log('warn', `    WARN ${m}`)
const fail = (m) => log('error', `    FAIL ${m}`)

const checks = []
function record(name, status, detail) { checks.push({ name, status, detail }) }

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
function isPlaceholder(k) {
  return !k || /^(REPLACE_ME|TODO|XXX|<.*>)/i.test(k) || k.length < 10
}

// --- Check 1: Node version ---
function checkNode() {
  step('Check 1/3: Node.js')
  const v = process.version
  const major = parseInt(v.replace(/^v/, '').split('.')[0], 10)
  if (major >= 18) {
    ok(`Node ${v} (>= v18, hat fetch built-in)`)
    record('Node.js', 'ok', v)
    return true
  }
  fail(`Node ${v} ist zu alt -- mindestens v18 noetig (built-in fetch).`)
  record('Node.js', 'fail', `${v}, mind. v18 erforderlich`)
  return false
}

// --- Check 2: API-Key vorhanden ---
function resolveKey() {
  const overridePath = path.join(homedir(), '.claude', '.env', 'ai-create-image-set.env')
  const defaultPath = path.join(SKILL_DIR, 'config', 'secrets.default.env')
  const o = parseEnvFile(overridePath).OPENAI_API_KEY
  if (o && !isPlaceholder(o)) return { key: o, source: overridePath }
  const d = parseEnvFile(defaultPath).OPENAI_API_KEY
  if (d && !isPlaceholder(d)) return { key: d, source: defaultPath }
  const e = process.env.OPENAI_API_KEY
  if (e && !isPlaceholder(e)) return { key: e, source: 'env:OPENAI_API_KEY' }
  return null
}

function checkKeyPresent() {
  step('Check 2/3: OPENAI_API_KEY vorhanden')
  const auth = resolveKey()
  if (!auth) {
    fail('Kein gueltiger Key gefunden')
    record('OPENAI_API_KEY (Konfig)', 'fail',
      `Loesung A: \`mkdir -p ~/.claude/.env && echo "OPENAI_API_KEY=sk-..." > ~/.claude/.env/ai-create-image-set.env\`\n\n` +
      `Loesung B: Datei \`${path.join(SKILL_DIR, 'config', 'secrets.default.env')}\` editieren und Platzhalter ersetzen.`)
    return null
  }
  ok(`Key aus ${auth.source}`)
  record('OPENAI_API_KEY (Konfig)', 'ok', auth.source)
  return auth
}

// --- Check 3: API-Key live validieren ---
async function checkKeyLive(auth) {
  step('Check 3/3: OPENAI_API_KEY live testen (GET /v1/models)')
  if (!auth) {
    warn('Uebersprungen, weil kein Key vorhanden')
    record('OPENAI_API_KEY (live)', 'fail', 'kein Key -- erst Loesung aus Check 2 anwenden')
    return false
  }
  let res
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 15000)
    res = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${auth.key}` },
      signal: controller.signal,
    })
    clearTimeout(t)
  } catch (err) {
    fail(`Netzwerk-Fehler bei /v1/models: ${err.message}`)
    record('OPENAI_API_KEY (live)', 'fail',
      `Erreichbarkeit pruefen (Firewall/Proxy?): \`curl -I https://api.openai.com/v1/models\`. Fehler: ${err.message}`)
    return false
  }
  if (res.status === 401) {
    fail('HTTP 401 -- Key ungueltig oder abgelaufen')
    record('OPENAI_API_KEY (live)', 'fail', `HTTP 401 -- Key ungueltig oder abgelaufen. Neuen Key in ~/.claude/.env/ai-create-image-set.env eintragen.`)
    return false
  }
  if (!res.ok) {
    fail(`HTTP ${res.status} bei /v1/models`)
    record('OPENAI_API_KEY (live)', 'fail',
      `Unerwarteter Status ${res.status}. Body (erste 300 Zeichen): ${(await res.text()).slice(0, 300)}`)
    return false
  }
  let json
  try { json = await res.json() } catch { json = null }
  const count = Array.isArray(json?.data) ? json.data.length : 0
  ok(`Key gueltig, ${count} Modelle sichtbar`)
  record('OPENAI_API_KEY (live)', 'ok', `200 OK, ${count} Modelle sichtbar`)
  return true
}

// --- Lauf ---
say(`${SKILL_NAME} preflight (Plattform: ${platform()})`)
say(`Skill: ${SKILL_DIR}`)
say(`User: ${userInfo().username}@${hostname()}`)

if (existsSync(FAILED)) { try { unlinkSync(FAILED) } catch {} }

const nodeOk = checkNode()
const auth = checkKeyPresent()
const liveOk = await checkKeyLive(auth)

const allOk = nodeOk && !!auth && liveOk

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

Alle Voraussetzungen vorhanden, Skill ist einsatzbereit.

## Checks

${summary}

## Preflight-Log

${fullLog}

---
Solange diese Datei existiert, ueberspringt das Skill den Preflight.
Bei Aktualisierungen (z.B. Key-Rotation) loeschen -- naechster Aufruf startet den Preflight neu.
`)
  say(`\nFertig. SKILL_INSTALLED.md geschrieben.`)
  process.exit(0)
} else {
  const failedItems = checks.filter(c => c.status === 'fail')
  const remediation = failedItems.map(c => `### ${c.name}\n\n${c.detail}\n`).join('\n')
  writeFileSync(FAILED, `# ${SKILL_NAME}: SKILL_INSTALL_FAILED

${meta}

## Status: FAILED

${failedItems.length} von ${checks.length} Checks sind fehlgeschlagen.

## Checks

${summary}

## Was zu tun ist

${remediation}

## Preflight-Log

${fullLog}

---
Nach Behebung: diese Datei loeschen und Preflight erneut starten:
\`\`\`
bash "${SKILL_DIR}/scripts/preflight.sh"          # macOS/Linux
powershell -ExecutionPolicy Bypass -File "${SKILL_DIR}\\scripts\\preflight.ps1"  # Windows
\`\`\`
`)
  log('error', `\nPreflight FEHLGESCHLAGEN. Details in ${FAILED}`)
  process.exit(1)
}
