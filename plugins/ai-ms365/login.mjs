// ms365 — friendly Microsoft 365 login for non-technical users.
// Spawns @softeria/ms-365-mcp-server --login, parses the device-code line as
// it appears, auto-opens the browser and auto-copies the code to clipboard.
// Falls back gracefully (with the URL/code printed prominently) if either OS
// integration fails. Token persists to ~/.config/ms-365-mcp/token-cache.json.
//
// Invoked via the tiny login.sh / login.cmd wrappers next to this file.
//
// Credentials (MS365_MCP_CLIENT_ID / TENANT_ID) are loaded from
// ~/.claude/.env/ms365.env. If that file is missing or incomplete, we print
// instructions and exit so the user can populate it.

import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

const SECRETS_FILE = path.join(os.homedir(), '.claude', '.env', 'ms365.env');
const REQUIRED_VARS = ['MS365_MCP_CLIENT_ID', 'MS365_MCP_TENANT_ID'];

function loadEnvFile(p) {
  if (!fs.existsSync(p)) return false;
  const text = fs.readFileSync(p, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
  return true;
}

const stillMissing = () => REQUIRED_VARS.filter((k) => !process.env[k] || process.env[k].trim() === '');
if (stillMissing().length > 0) loadEnvFile(SECRETS_FILE);
if (stillMissing().length > 0) {
  console.error('');
  console.error('Microsoft 365 credentials missing: ' + stillMissing().join(', '));
  console.error('Populate ' + SECRETS_FILE + ' first.');
  console.error('Start Claude Code once after installing the plugin — that creates a');
  console.error('template at ~/.claude/.env/ms365.env.template you can fill in.');
  console.error('');
  process.exit(1);
}

const cfgDir = path.join(os.homedir(), '.config', 'ms-365-mcp');
fs.mkdirSync(cfgDir, { recursive: true, mode: 0o700 });

if (!process.env.MS365_MCP_TOKEN_CACHE_PATH) {
  process.env.MS365_MCP_TOKEN_CACHE_PATH = path.join(cfgDir, 'token-cache.json');
}
if (!process.env.MS365_MCP_SELECTED_ACCOUNT_PATH) {
  process.env.MS365_MCP_SELECTED_ACCOUNT_PATH = path.join(cfgDir, 'selected-account.json');
}

const hookUrl = pathToFileURL(path.join(__dirname, 'disable-keytar.mjs')).href;
process.env.NODE_OPTIONS = `--experimental-loader=${hookUrl} --no-warnings`;

const c = (code, s) => process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s;
const bold  = (s) => c('1', s);
const green = (s) => c('32', s);
const yellow= (s) => c('33', s);
const red   = (s) => c('31', s);
const dim   = (s) => c('2', s);
const cyan  = (s) => c('36', s);

console.log('');
console.log(bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
console.log(bold('  Microsoft 365 — Login'));
console.log(bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
console.log('');
console.log('Was gleich passiert:');
console.log('  1. Browser öffnet sich automatisch');
console.log('  2. Der Code ist schon in der ' + bold('Zwischenablage'));
console.log('  3. Im Browser einfügen ' + dim('(Cmd+V auf Mac, Ctrl+V auf Windows)') + ', absenden');
console.log('  4. Mit deinem ' + bold('Microsoft-Account') + ' anmelden');
console.log('  5. Hier wartet das Skript bis fertig — danach Fenster zumachen.');
console.log('');
console.log(dim('Falls Browser/Zwischenablage nicht klappen: URL und Code'));
console.log(dim('werden trotzdem groß angezeigt — Cmd-Klick (Mac) bzw.'));
console.log(dim('Strg-Klick (Windows-Terminal) auf den Link öffnet ihn meistens auch.'));
console.log('');

const args = ['-y', '@softeria/ms-365-mcp-server', '--org-mode', '--login'];
const cmd = isWindows ? 'cmd' : 'npx';
const cmdArgs = isWindows ? ['/c', 'npx', ...args] : args;

const child = spawn(cmd, cmdArgs, {
  stdio: ['inherit', 'pipe', 'inherit'],
  env: process.env,
  windowsHide: true,
});

let handled = false;
let buffer = '';

child.stdout.on('data', async (chunk) => {
  const text = chunk.toString();
  buffer += text;
  process.stdout.write(text);

  if (handled) return;
  const urlMatch  = buffer.match(/https?:\/\/\S+device\S*/i);
  const codeMatch = buffer.match(/code\s+([A-Z0-9]+)\s+to/i);
  if (!urlMatch || !codeMatch) return;

  handled = true;
  const url  = urlMatch[0].replace(/[.,)]+$/, '');
  const code = codeMatch[1];

  console.log('');
  console.log(bold(green('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')));
  console.log('  ' + bold('URL:  ')  + cyan(url));
  console.log('  ' + bold('Code: ') + cyan(code));
  console.log(bold(green('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')));
  console.log('');

  const [copyOk, openOk] = await Promise.all([
    copyToClipboard(code).then(() => true).catch(() => false),
    openInBrowser(url).then(() => true).catch(() => false),
  ]);

  console.log(copyOk
    ? green('  [OK] Code in Zwischenablage kopiert — im Browser einfügen.')
    : yellow('  [!]  Code-Auto-Copy nicht möglich — Code oben manuell tippen.'));
  console.log(openOk
    ? green('  [OK] Browser geöffnet.')
    : yellow('  [!]  Browser-Auto-Open nicht möglich — URL oben manuell öffnen.'));
  console.log('');
  console.log(dim('  Sobald du im Browser fertig bist, läuft hier automatisch der Test...'));
  console.log('');
});

child.on('error', (err) => {
  console.error(red(`Fehler beim Start: ${err.message}`));
  process.exit(1);
});

child.on('exit', (code) => {
  console.log('');
  if (code === 0) {
    console.log(bold(green('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')));
    console.log(bold(green('  Login erfolgreich. Token gespeichert in:')));
    console.log('  ' + dim(process.env.MS365_MCP_TOKEN_CACHE_PATH));
    console.log(bold(green('  Du kannst dieses Fenster jetzt schließen.')));
    console.log(bold(green('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')));
  } else {
    console.log(bold(red('Login fehlgeschlagen — Exit-Code ' + code)));
    console.log(dim('Logs: ~/.ms-365-mcp-server/logs/mcp-server.log'));
  }
  console.log('');
  process.exit(code ?? 0);
});

function copyToClipboard(text) {
  return new Promise((resolve, reject) => {
    let tool, args;
    if (isMac)        { tool = 'pbcopy';   args = []; }
    else if (isWindows) { tool = 'clip';   args = []; }
    else              { tool = 'xclip';    args = ['-selection', 'clipboard']; }
    const p = spawn(tool, args, { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
    p.on('error', reject);
    p.on('exit', (c) => c === 0 ? resolve() : reject(new Error(`${tool} exit ${c}`)));
    p.stdin.write(text);
    p.stdin.end();
  });
}

function openInBrowser(url) {
  return new Promise((resolve, reject) => {
    let tool, args;
    if (isMac)        { tool = 'open';     args = [url]; }
    else if (isWindows) { tool = 'cmd';    args = ['/c', 'start', '', url]; }
    else              { tool = 'xdg-open'; args = [url]; }
    const p = spawn(tool, args, { stdio: 'ignore', detached: true, windowsHide: true });
    p.on('error', reject);
    p.on('spawn', () => { p.unref(); resolve(); });
  });
}
