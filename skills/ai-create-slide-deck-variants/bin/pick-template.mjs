#!/usr/bin/env node
// ai-create-slide-deck-variants -- listet Deck-Vorlagen, kopiert eine ausgewaehlte ins Projekt.

import { existsSync, readFileSync, copyFileSync, mkdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILL_DIR = path.resolve(__dirname, '..')
const TEMPLATES_DIR = path.join(SKILL_DIR, 'templates')
const VARIANTS_FILE = path.join(TEMPLATES_DIR, '_variants.json')
const INSTALLED = path.join(SKILL_DIR, 'SKILL_INSTALLED.md')
const FAILED = path.join(SKILL_DIR, 'SKILL_INSTALL_FAILED.md')

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

function loadVariants() {
  if (!existsSync(VARIANTS_FILE)) {
    console.error(`ERROR: _variants.json fehlt in ${TEMPLATES_DIR}`)
    process.exit(4)
  }
  return JSON.parse(readFileSync(VARIANTS_FILE, 'utf8')).variants
}

function printHelp() {
  console.log(`ai-create-slide-deck-variants -- HTML-Deck-Vorlagen waehlen

Verwendung:
  pick-template.mjs --list
  pick-template.mjs --variant ID --out FILE [--force]
  pick-template.mjs --show ID
  pick-template.mjs --recommend "Was soll das Deck transportieren?"

Optionen:
  --list                Alle Varianten anzeigen (verfuegbar + zu bauen)
  --variant ID          Variante per ID (z.B. 01, 06, 10) waehlen
  --out FILE            Ziel-HTML-Pfad fuer die Kopie
  --show ID             Vorlagen-Details fuer eine ID drucken (kein Kopieren)
  --force               Ziel ueberschreiben, falls vorhanden
  --recommend "..."     Sucht passende Variante per Stichwort-Match (heuristic)
  -h, --help            Diese Hilfe

Workflow:
  1. \`--list\` zeigt alle 10 Varianten mit "verfuegbar"-Status
  2. Eine ID auswaehlen (Empfehlung: erste mal --list oder --recommend)
  3. \`--variant 06 --out my-deck.html\` kopiert die Vorlage ins Projekt
  4. Datei oeffnen, Inhalte ersetzen, Bild-Slots zeigen lassen

Slot-System: alle Vorlagen referenzieren img/backgrounds/ai/bg-*.jpg fuer Hintergruende.
Bilder fehlen -> Deck faellt auf Gradient zurueck (kein Crash).
Bilder generieren: siehe /ai-create-image-set.
`)
}

function formatVariantRow(v) {
  const status = v.available ? '\x1b[32mverfuegbar\x1b[0m' : '\x1b[33mzu bauen  \x1b[0m'
  return `  ${v.id}  ${status}  ${v.framework.padEnd(10)}  ${v.style.padEnd(24)}  ${v.when}`
}

let parsed
try {
  parsed = parseArgs({
    options: {
      list: { type: 'boolean', default: false },
      variant: { type: 'string' },
      out: { type: 'string' },
      show: { type: 'string' },
      force: { type: 'boolean', default: false },
      recommend: { type: 'string' },
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

checkInstallGate()

const variants = loadVariants()

if (values.list || (!values.variant && !values.show && !values.recommend)) {
  console.log('Verfuegbare Deck-Varianten:')
  console.log('  ID  STATUS      FRAMEWORK   STIL                       WANN NUTZEN')
  for (const v of variants) console.log(formatVariantRow(v))
  console.log()
  console.log(`Vorlagen-Ordner: ${TEMPLATES_DIR}`)
  process.exit(0)
}

if (values.show) {
  const v = variants.find(x => x.id === values.show)
  if (!v) { console.error(`Unbekannte ID: ${values.show}`); process.exit(2) }
  console.log(JSON.stringify(v, null, 2))
  if (v.file && v.available) {
    const fp = path.join(TEMPLATES_DIR, v.file)
    if (existsSync(fp)) {
      const size = statSync(fp).size
      console.log(`\nDatei: ${fp} (${(size / 1024).toFixed(1)} KB)`)
    }
  }
  process.exit(0)
}

if (values.recommend) {
  const q = values.recommend.toLowerCase()
  const keywords = {
    cinematic: ['01', '06', '08'],
    cinema: ['01', '06', '08'],
    atmosphaere: ['01', '06', '08'],
    atmosphäre: ['01', '06', '08'],
    dunkel: ['01', '08'],
    dark: ['01', '08'],
    editorial: ['02', '07', '10'],
    magazin: ['02', '07'],
    text: ['02', '07', '10'],
    minimal: ['05', '10'],
    swiss: ['05'],
    grid: ['05'],
    bold: ['04', '09'],
    statement: ['04', '09'],
    typografie: ['09'],
    typography: ['09'],
    headline: ['09'],
    brand: ['03'],
    'v&s': ['03'],
    hausstil: ['03'],
    split: ['07'],
    foto: ['07', '06'],
    'full bleed': ['06'],
    fullbleed: ['06'],
    premium: ['08'],
    zurueckhaltung: ['10'],
    zurückhaltung: ['10'],
    'reveal.js': ['01', '02', '03', '04', '05'],
    revealjs: ['01', '02', '03', '04', '05'],
    webslides: ['06', '07', '08', '09', '10'],
  }
  const scores = new Map()
  for (const [kw, ids] of Object.entries(keywords)) {
    if (q.includes(kw)) for (const id of ids) scores.set(id, (scores.get(id) ?? 0) + 1)
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1])
  if (ranked.length === 0) {
    console.log('Keine direkten Stichwort-Treffer. --list zeigt alle Varianten.')
    process.exit(0)
  }
  console.log(`Empfehlung fuer "${values.recommend}":`)
  for (const [id, score] of ranked.slice(0, 5)) {
    const v = variants.find(x => x.id === id)
    console.log(`  ${v.id} (Match-Score ${score})  ${v.framework}/${v.style}  --  ${v.when}`)
  }
  process.exit(0)
}

// --variant + --out
if (!values.variant || !values.out) {
  console.error('ERROR: --variant ID --out FILE noetig (oder --list / --show / --recommend).')
  printHelp(); process.exit(2)
}

const v = variants.find(x => x.id === values.variant)
if (!v) {
  console.error(`Unbekannte Varianten-ID: ${values.variant}. Verfuegbare: ${variants.map(x => x.id).join(', ')}`)
  process.exit(2)
}
if (!v.available || !v.file) {
  console.error(`Variante ${v.id} ist als "zu bauen" markiert (keine fertige Vorlage).`)
  if (v.note) console.error(`Hinweis: ${v.note}`)
  console.error(`Empfehlung: Eine verfuegbare Variante kopieren (z.B. ${variants.find(x => x.available)?.id}) und CSS/Schrift tauschen.`)
  process.exit(5)
}

const src = path.join(TEMPLATES_DIR, v.file)
const dst = path.resolve(values.out)

if (!existsSync(src)) {
  console.error(`ERROR: Vorlagen-Datei fehlt: ${src}`)
  process.exit(6)
}
if (existsSync(dst) && !values.force) {
  console.error(`ERROR: Ziel existiert: ${dst} (mit --force ueberschreiben).`)
  process.exit(7)
}

mkdirSync(path.dirname(dst), { recursive: true })
copyFileSync(src, dst)

const info = {
  variant: v.id,
  framework: v.framework,
  style: v.style,
  template: src,
  out: dst,
  bytes: statSync(dst).size,
  next_steps: [
    "1. Datei oeffnen, Inhalte (Headlines, Body-Text) durch eigene ersetzen.",
    "2. Bild-Referenzen pruefen: img/backgrounds/ai/bg-*.jpg im Projekt-cwd. Fehlende Bilder => Gradient-Fallback.",
    "3. Bilder erzeugen: /ai-create-image-set --slots <slots.json>.",
    "4. Im Browser oeffnen: 'open " + dst + "' (macOS) oder 'start " + dst + "' (Windows).",
  ],
}
console.log(JSON.stringify(info, null, 2))
