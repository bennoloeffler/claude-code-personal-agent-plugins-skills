#!/usr/bin/env node
// ai-create-image -- generiert Bilder via OpenAI gpt-image-1
// Cross-platform (macOS, Windows, Linux). Setzt voraus: node >= 18.

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILL_DIR = path.resolve(__dirname, '..')
const INSTALLED = path.join(SKILL_DIR, 'SKILL_INSTALLED.md')
const FAILED = path.join(SKILL_DIR, 'SKILL_INSTALL_FAILED.md')

const VALID_SIZES = new Set(['1024x1024', '1024x1536', '1536x1024', 'auto'])
const VALID_QUALITY = new Set(['low', 'medium', 'high', 'auto'])

function checkInstallGate() {
  if (existsSync(INSTALLED)) return
  if (existsSync(FAILED)) {
    process.stderr.write('ERROR: Skill ist nicht einsatzbereit (vorheriger Preflight fehlgeschlagen).\n\n')
    process.stderr.write('Inhalt von SKILL_INSTALL_FAILED.md:\n')
    process.stderr.write('----------\n')
    process.stderr.write(readFileSync(FAILED, 'utf8'))
    process.stderr.write('\n----------\n')
    process.stderr.write('Loesung: Ursache beheben, SKILL_INSTALL_FAILED.md loeschen, Preflight erneut starten:\n')
    process.stderr.write(`  bash "${path.join(SKILL_DIR, 'scripts', 'preflight.sh')}"\n`)
    process.stderr.write(`  powershell -ExecutionPolicy Bypass -File "${path.join(SKILL_DIR, 'scripts', 'preflight.ps1')}"\n`)
    process.exit(10)
  }
  process.stderr.write('ERROR: Skill noch nicht installiert (keine SKILL_INSTALLED.md im Skill-Ordner).\n\n')
  process.stderr.write('Bitte zuerst Preflight ausfuehren:\n')
  process.stderr.write(`  macOS/Linux:  bash "${path.join(SKILL_DIR, 'scripts', 'preflight.sh')}"\n`)
  process.stderr.write(`  Windows:      powershell -ExecutionPolicy Bypass -File "${path.join(SKILL_DIR, 'scripts', 'preflight.ps1')}"\n`)
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

function isPlaceholder(k) {
  if (!k) return true
  return /^(REPLACE_ME|TODO|XXX|<.*>)/i.test(k) || k.length < 10
}

function resolveApiKey() {
  const overridePath = path.join(homedir(), '.claude', '.env', 'ai-create-image.env')
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
  const real = path.join(dir, 'ai-create-image.env')
  const tpl = path.join(dir, 'ai-create-image.env.template')
  try { mkdirSync(dir, { recursive: true, mode: 0o700 }) } catch {}
  let created = false
  if (!existsSync(real) && !existsSync(tpl)) {
    try {
      writeFileSync(tpl,
`# OpenAI API key for the ai-create-image skill.
#
# How to use:
#   1. Get an API key from https://platform.openai.com/api-keys
#   2. Paste it after the equals sign below (no quotes, no spaces around =)
#   3. Rename this file to ai-create-image.env (drop the .template suffix)
#
# Resolution order at runtime:
#   1. $OPENAI_API_KEY environment variable
#   2. ~/.claude/.env/ai-create-image.env (this file, once renamed)
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
  console.error('[ai-create-image] Missing OPENAI_API_KEY.')
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
  console.error('    2. Edit the template, paste the key, save it as ai-create-image.env')
  console.error('       (drop the .template suffix)')
  console.error('    3. Re-run this command.')
  console.error('')
}

function printHelp() {
  console.log(`ai-create-image -- Bilder via OpenAI gpt-image-1

Verwendung:
  create-image.mjs [optionen] "PROMPT"
  create-image.mjs --prompt "PROMPT" [optionen]

Optionen:
  --size SIZE        1024x1024 | 1024x1536 | 1536x1024 | auto (Default: 1024x1024)
  --quality LEVEL    low | medium | high | auto (Default: high)
  --out NAME         Output-Dateiname ohne .png (Default: img-<HHMMSS>)
  --cwd DIR          Basisverzeichnis (Output landet in <cwd>/output/YYYY-MM-DD/)
  --model NAME       Modell-Override (Default: gpt-image-1)
  -h, --help         Diese Hilfe

API-Key: Override > Skill-Default > $OPENAI_API_KEY.
Output : <cwd>/output/YYYY-MM-DD/<name>.png + <name>.prompt.txt
`)
}

let parsed
try {
  parsed = parseArgs({
    options: {
      size: { type: 'string', default: '1024x1024' },
      quality: { type: 'string', default: 'high' },
      out: { type: 'string' },
      cwd: { type: 'string' },
      model: { type: 'string', default: 'gpt-image-1' },
      prompt: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  })
} catch (err) {
  console.error(`Argument-Fehler: ${err.message}`)
  printHelp()
  process.exit(2)
}

const { values, positionals } = parsed
if (values.help) { printHelp(); process.exit(0) }

const prompt = (values.prompt ?? positionals.join(' ')).trim()
if (!prompt) {
  console.error('ERROR: Kein Prompt angegeben.')
  printHelp()
  process.exit(2)
}

if (!VALID_SIZES.has(values.size)) {
  console.error(`ERROR: Ungueltige --size "${values.size}". Erlaubt: ${[...VALID_SIZES].join(', ')}`)
  process.exit(2)
}
if (!VALID_QUALITY.has(values.quality)) {
  console.error(`ERROR: Ungueltige --quality "${values.quality}". Erlaubt: ${[...VALID_QUALITY].join(', ')}`)
  process.exit(2)
}

checkInstallGate()

const auth = resolveApiKey()
if (!auth) {
  printMissingKeyInstructions()
  process.exit(3)
}

// Output paths
const baseDir = values.cwd ? path.resolve(values.cwd) : process.cwd()
const now = new Date()
const datePart = now.toISOString().slice(0, 10) // YYYY-MM-DD
const timePart = now.toISOString().slice(11, 19).replace(/:/g, '')
const outDir = path.join(baseDir, 'output', datePart)
mkdirSync(outDir, { recursive: true })

const name = (values.out || `img-${timePart}`).replace(/\.png$/i, '')
const pngPath = path.join(outDir, `${name}.png`)
const promptPath = path.join(outDir, `${name}.prompt.txt`)

const body = {
  model: values.model,
  prompt,
  size: values.size,
  quality: values.quality,
  n: 1,
}

console.error(`[ai-create-image] Modell: ${values.model}  Size: ${values.size}  Quality: ${values.quality}`)
console.error(`[ai-create-image] Key aus: ${auth.source}`)
console.error(`[ai-create-image] Output:  ${pngPath}`)

let res
try {
  res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${auth.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
} catch (err) {
  console.error(`ERROR: HTTP-Request fehlgeschlagen: ${err.message}`)
  process.exit(4)
}

const text = await res.text()
let json
try { json = JSON.parse(text) } catch { json = null }

if (!res.ok) {
  console.error(`ERROR: HTTP ${res.status} ${res.statusText}`)
  const apiErr = json?.error
  if (apiErr) {
    console.error(`  type:    ${apiErr.type ?? '?'}`)
    console.error(`  code:    ${apiErr.code ?? '?'}`)
    console.error(`  message: ${apiErr.message ?? text}`)
  } else {
    console.error(text)
  }
  // Common hints
  if (res.status === 401) console.error('Hinweis: API-Key falsch/abgelaufen.')
  if (res.status === 429) console.error('Hinweis: Rate-Limit -- 30s warten und nochmal.')
  if (res.status === 400 && /content_policy/.test(text)) {
    console.error('Hinweis: Prompt enthaelt verbotenes Motiv -- umformulieren.')
  }
  process.exit(5)
}

const b64 = json?.data?.[0]?.b64_json
if (!b64) {
  console.error('ERROR: Antwort enthaelt kein b64_json:')
  console.error(text.slice(0, 500))
  process.exit(6)
}

writeFileSync(pngPath, Buffer.from(b64, 'base64'))
writeFileSync(promptPath, prompt + '\n')

const result = {
  png: pngPath,
  prompt_file: promptPath,
  size: values.size,
  quality: values.quality,
  model: values.model,
  bytes: Buffer.from(b64, 'base64').length,
  key_source: auth.source,
  created_at: now.toISOString(),
}
console.log(JSON.stringify(result, null, 2))
