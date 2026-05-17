#!/usr/bin/env node
// ai-create-image-set -- erzeugt einen konsistenten Satz von Bildern via OpenAI gpt-image-1.
// Liest eine Slot-Datei (JSON), haengt einen Stil-Anker an jeden Prompt, ruft parallel auf.

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILL_DIR = path.resolve(__dirname, '..')
const INSTALLED = path.join(SKILL_DIR, 'SKILL_INSTALLED.md')
const FAILED = path.join(SKILL_DIR, 'SKILL_INSTALL_FAILED.md')
const PRESETS_PATH = path.join(SKILL_DIR, 'resources', 'style-presets.json')

const VALID_SIZES = new Set(['1024x1024', '1024x1536', '1536x1024', 'auto'])
const VALID_QUALITY = new Set(['low', 'medium', 'high', 'auto'])

function checkInstallGate() {
  if (existsSync(INSTALLED)) return
  if (existsSync(FAILED)) {
    process.stderr.write('ERROR: Skill ist nicht einsatzbereit (vorheriger Preflight fehlgeschlagen).\n\n')
    process.stderr.write(readFileSync(FAILED, 'utf8'))
    process.exit(10)
  }
  process.stderr.write('ERROR: Skill noch nicht installiert. Preflight ausfuehren:\n')
  process.stderr.write(`  bash "${path.join(SKILL_DIR, 'scripts', 'preflight.sh')}"\n`)
  process.exit(11)
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {}
  const out = {}
  for (const raw of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
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

function resolveApiKey() {
  const overridePath = path.join(homedir(), '.claude', '.env', 'ai-create-image-set.env')
  const defaultPath = path.join(SKILL_DIR, 'config', 'secrets.default.env')
  const o = parseEnvFile(overridePath).OPENAI_API_KEY
  if (o && !isPlaceholder(o)) return { key: o, source: overridePath }
  const d = parseEnvFile(defaultPath).OPENAI_API_KEY
  if (d && !isPlaceholder(d)) return { key: d, source: defaultPath }
  if (process.env.OPENAI_API_KEY && !isPlaceholder(process.env.OPENAI_API_KEY)) {
    return { key: process.env.OPENAI_API_KEY, source: 'env:OPENAI_API_KEY' }
  }
  return null
}

function writeSecretsTemplateIfMissing() {
  const dir = path.join(homedir(), '.claude', '.env')
  const real = path.join(dir, 'ai-create-image-set.env')
  const tpl = path.join(dir, 'ai-create-image-set.env.template')
  try { mkdirSync(dir, { recursive: true, mode: 0o700 }) } catch {}
  let created = false
  if (!existsSync(real) && !existsSync(tpl)) {
    try {
      writeFileSync(tpl,
`# OpenAI API key for the ai-create-image-set skill.
#
# How to use:
#   1. Get an API key from https://platform.openai.com/api-keys
#   2. Paste it after the equals sign below (no quotes, no spaces around =)
#   3. Rename this file to ai-create-image-set.env (drop the .template suffix)
#
# Resolution order at runtime:
#   1. $OPENAI_API_KEY environment variable
#   2. ~/.claude/.env/ai-create-image-set.env (this file, once renamed)
#
# Keep this file private (default mode 0600). Do not commit it.

OPENAI_API_KEY=
`, { mode: 0o600 })
      created = true
    } catch {}
  }
  return { real, tpl, created }
}

function printMissingKeyInstructions() {
  const t = writeSecretsTemplateIfMissing()
  console.error('')
  console.error('[ai-create-image-set] Missing OPENAI_API_KEY.')
  console.error('')
  console.error('  This skill calls OpenAI gpt-image-1 and needs an API key.')
  console.error('  Put it in:')
  console.error('         ' + t.real)
  console.error('')
  if (t.created) {
    console.error('  A template has been created at:')
    console.error('         ' + t.tpl)
    console.error('')
  }
  console.error('  Steps:')
  console.error('    1. Get an API key from https://platform.openai.com/api-keys')
  console.error('    2. Edit the template, paste the key, save it as ai-create-image-set.env')
  console.error('       (drop the .template suffix)')
  console.error('    3. Re-run this command.')
  console.error('')
}

function loadPresets() {
  if (!existsSync(PRESETS_PATH)) return {}
  try { return JSON.parse(readFileSync(PRESETS_PATH, 'utf8')) }
  catch { return {} }
}

function printHelp() {
  const presets = Object.keys(loadPresets())
  console.log(`ai-create-image-set -- Konsistente Bild-Serie via gpt-image-1

Verwendung:
  create-image-set.mjs --slots <FILE.json> [optionen]
  create-image-set.mjs --list-styles
  create-image-set.mjs --show-style <NAME>

Optionen:
  --slots FILE           JSON mit { slots: [{name, prompt}], style?, style_text?, size?, quality?, out_dir? }
  --style NAME           Style-Preset ueberschreibt slots.style.
                          Verfuegbar: ${presets.join(', ') || '(keiner)'}
  --style-text "..."     Freitext-Stilanker ueberschreibt alles
  --size SIZE            1024x1024 | 1024x1536 | 1536x1024 | auto (Default: 1536x1024)
  --quality LEVEL        low | medium | high | auto (Default: medium)
  --out-dir DIR          Ausgabe-Verzeichnis (Default: img/backgrounds/ai)
  --cwd DIR              Basisverzeichnis fuer relative Pfade (Default: cwd)
  --concurrency N        Parallele Requests (Default: 4)
  --model NAME           Modell (Default: gpt-image-1)
  --force                ueberschreibt vorhandene PNGs (Default: skip)
  --dry-run              Zeigt nur was getan wuerde, keine API-Calls
  --list-styles          Listet Style-Presets
  --show-style NAME      Druckt den Stil-Anker-Text
  -h, --help             Diese Hilfe

Output:
  <cwd>/<out_dir>/<slot>.png
  <cwd>/<out_dir>/<slot>.prompt.txt    (verwendeter Prompt + Stil)
`)
}

let parsed
try {
  parsed = parseArgs({
    options: {
      slots: { type: 'string' },
      style: { type: 'string' },
      'style-text': { type: 'string' },
      size: { type: 'string' },
      quality: { type: 'string' },
      'out-dir': { type: 'string' },
      cwd: { type: 'string' },
      concurrency: { type: 'string' },
      model: { type: 'string', default: 'gpt-image-1' },
      force: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      'list-styles': { type: 'boolean', default: false },
      'show-style': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  })
} catch (err) {
  console.error(`Argument-Fehler: ${err.message}`)
  printHelp(); process.exit(2)
}

const { values } = parsed
if (values.help) { printHelp(); process.exit(0) }

const presets = loadPresets()

if (values['list-styles']) {
  for (const [name, text] of Object.entries(presets)) {
    console.log(`# ${name}`)
    console.log(`${text}\n`)
  }
  process.exit(0)
}
if (values['show-style']) {
  const t = presets[values['show-style']]
  if (!t) { console.error(`Unbekannter Style "${values['show-style']}". Verfuegbar: ${Object.keys(presets).join(', ')}`); process.exit(2) }
  console.log(t); process.exit(0)
}

if (!values.slots) {
  console.error('ERROR: --slots <FILE.json> ist Pflicht (oder --list-styles / --show-style).\n')
  printHelp(); process.exit(2)
}

// Slot-Datei einlesen
const slotsPath = path.resolve(values.slots)
if (!existsSync(slotsPath)) {
  console.error(`ERROR: Slot-Datei nicht gefunden: ${slotsPath}`); process.exit(2)
}
let cfg
try { cfg = JSON.parse(readFileSync(slotsPath, 'utf8')) }
catch (err) { console.error(`ERROR: Slot-Datei nicht parsbar: ${err.message}`); process.exit(2) }

if (!Array.isArray(cfg.slots) || cfg.slots.length === 0) {
  console.error('ERROR: slots-Array fehlt oder leer.'); process.exit(2)
}

// Style-Anker ermitteln
let styleText = values['style-text'] ?? cfg.style_text
if (!styleText) {
  const styleName = values.style ?? cfg.style
  if (styleName) {
    styleText = presets[styleName]
    if (!styleText) {
      console.error(`ERROR: Unbekannter Style "${styleName}". Verfuegbar: ${Object.keys(presets).join(', ')}`)
      process.exit(2)
    }
  }
}
if (!styleText) {
  styleText = presets['editorial-photo']
  console.error(`[ai-create-image-set] Kein Style angegeben -- nutze Default "editorial-photo".`)
}

const size = values.size ?? cfg.size ?? '1536x1024'
const quality = values.quality ?? cfg.quality ?? 'medium'
if (!VALID_SIZES.has(size)) { console.error(`ERROR: Ungueltige size "${size}"`); process.exit(2) }
if (!VALID_QUALITY.has(quality)) { console.error(`ERROR: Ungueltige quality "${quality}"`); process.exit(2) }

const baseDir = values.cwd ? path.resolve(values.cwd) : process.cwd()
const outDir = path.resolve(baseDir, values['out-dir'] ?? cfg.out_dir ?? 'img/backgrounds/ai')
mkdirSync(outDir, { recursive: true })

const concurrency = Math.max(1, parseInt(values.concurrency ?? '4', 10))
const model = values.model

checkInstallGate()

const auth = resolveApiKey()
if (!auth) {
  printMissingKeyInstructions()
  process.exit(3)
}

// Validate slot entries
for (const s of cfg.slots) {
  if (!s.name || !s.prompt) {
    console.error(`ERROR: Slot ohne name oder prompt: ${JSON.stringify(s)}`); process.exit(2)
  }
  if (!/^[\w.-]+$/.test(s.name)) {
    console.error(`ERROR: Slot-Name enthaelt unerlaubte Zeichen: ${s.name} (erlaubt: A-Za-z0-9._-)`); process.exit(2)
  }
}

console.error(`[ai-create-image-set] ${cfg.slots.length} Slots, size=${size} quality=${quality} concurrency=${concurrency}`)
console.error(`[ai-create-image-set] Style: ${styleText.slice(0, 80)}${styleText.length > 80 ? '...' : ''}`)
console.error(`[ai-create-image-set] Out:   ${outDir}`)
console.error(`[ai-create-image-set] Key aus: ${auth.source}`)

// Filter slots: skip those that exist (unless --force)
const tasks = []
for (const s of cfg.slots) {
  const pngPath = path.join(outDir, `${s.name}.png`)
  if (existsSync(pngPath) && !values.force) {
    console.error(`[skip] ${s.name} (existiert: ${pngPath})`)
    continue
  }
  tasks.push({ name: s.name, prompt: s.prompt, pngPath, promptPath: path.join(outDir, `${s.name}.prompt.txt`) })
}

if (tasks.length === 0) {
  console.error('Nichts zu tun -- alle Slots existieren. (--force erzwingt Regeneration.)')
  process.exit(0)
}

if (values['dry-run']) {
  console.error('\n--dry-run: keine API-Calls. Es wuerden folgende Slots erzeugt:')
  for (const t of tasks) console.log(JSON.stringify({ name: t.name, png: t.pngPath, prompt: t.prompt.slice(0, 100) + '...' }))
  process.exit(0)
}

async function generateSlot(task) {
  const fullPrompt = `${task.prompt}\n\nStyle: ${styleText}`
  const body = JSON.stringify({ model, prompt: fullPrompt, size, quality, n: 1 })
  const t0 = Date.now()
  let res
  try {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${auth.key}`, 'Content-Type': 'application/json' },
      body,
    })
  } catch (err) {
    return { ...task, ok: false, error: `Netz: ${err.message}`, ms: Date.now() - t0 }
  }
  const text = await res.text()
  let json; try { json = JSON.parse(text) } catch { json = null }
  if (!res.ok) {
    const apiErr = json?.error
    const msg = apiErr ? `HTTP ${res.status} ${apiErr.code ?? ''}: ${apiErr.message ?? ''}` : `HTTP ${res.status}: ${text.slice(0, 200)}`
    return { ...task, ok: false, error: msg, ms: Date.now() - t0 }
  }
  const b64 = json?.data?.[0]?.b64_json
  if (!b64) return { ...task, ok: false, error: 'Antwort ohne b64_json', ms: Date.now() - t0 }
  const buf = Buffer.from(b64, 'base64')
  writeFileSync(task.pngPath, buf)
  writeFileSync(task.promptPath, fullPrompt + '\n')
  return { ...task, ok: true, bytes: buf.length, ms: Date.now() - t0 }
}

// Run with concurrency limit
async function runPool(items, n, worker) {
  const results = []
  let cursor = 0
  async function runner() {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      const r = await worker(items[i])
      results.push(r)
      const idx = results.length
      const mark = r.ok ? 'OK  ' : 'FAIL'
      const info = r.ok ? `${(r.bytes / 1024).toFixed(0)} KB in ${r.ms}ms` : r.error
      process.stderr.write(`[${idx.toString().padStart(2)}/${items.length}] ${mark}  ${r.name}  ${info}\n`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, runner))
  return results
}

const t0 = Date.now()
const results = await runPool(tasks, concurrency, generateSlot)
const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

const okCount = results.filter(r => r.ok).length
const failCount = results.length - okCount

const summary = {
  total: results.length,
  ok: okCount,
  fail: failCount,
  elapsed_s: parseFloat(elapsed),
  out_dir: outDir,
  results: results.map(r => ({
    name: r.name,
    ok: r.ok,
    png: r.ok ? r.pngPath : null,
    error: r.ok ? null : r.error,
    bytes: r.bytes ?? null,
    ms: r.ms,
  })),
}
console.log(JSON.stringify(summary, null, 2))
process.exit(failCount === 0 ? 0 : 1)
