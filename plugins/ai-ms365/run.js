#!/usr/bin/env node
// ms365: cross-platform launcher for @softeria/ms-365-mcp-server.
//
// Three responsibilities:
//   1. Cross-platform spawn — Windows can't `spawn('npx', ...)` directly because
//      npx is a .cmd batch wrapper; we use `cmd /c npx ...` there.
//   2. Force file-based token cache so cowork's device-code login persists.
//      We do this by (a) defaulting MS365_MCP_TOKEN_CACHE_PATH to a per-user
//      file and (b) injecting an ESM loader hook that makes `import("keytar")`
//      throw — which trips the server's existing keytar→file fallback for
//      both read and write paths.
//   3. Install self-contained login scripts to ~/.config/ms-365-mcp/ so users
//      have a STABLE path to run in their terminal. Cowork installs the
//      plugin into a session-randomized sandbox path under
//      ~/Library/Application Support/Claude/local-agent-mode-sessions/<uuid>/...
//      which nobody can guess; we copy disable-keytar.mjs there too and
//      generate self-contained login.sh / login.cmd at this stable location.
//
// Secrets: Azure AD client_id / tenant_id / client_secret are NOT embedded.
// On first run we load them from ~/.claude/.env/ms365.env. If that file is
// missing or incomplete, we write a template alongside it and print clear
// instructions, then exit so the user can populate it.
//
// Why not the macOS Keychain: cowork's sandbox can't reliably hold the
// 1-15 min device-code polling + Keychain write together inside an MCP stdio
// session, so login appears to succeed but the token never lands. File-based
// persistence side-steps that entirely. Even file-based persistence still
// requires the polling itself to run somewhere stable — that's why login
// has to be triggered from a normal terminal, not from inside cowork.

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { pathToFileURL } = require('url');

const SECRETS_DIR = path.join(os.homedir(), '.claude', '.env');
const SECRETS_FILE = path.join(SECRETS_DIR, 'ms365.env');
const SECRETS_TEMPLATE = path.join(SECRETS_DIR, 'ms365.env.template');
const REQUIRED_VARS = ['MS365_MCP_CLIENT_ID', 'MS365_MCP_TENANT_ID', 'MS365_MCP_CLIENT_SECRET'];

ensureSecretsOrExit();

const stableDir = path.join(os.homedir(), '.config', 'ms-365-mcp');

if (!process.env.MS365_MCP_TOKEN_CACHE_PATH) {
  process.env.MS365_MCP_TOKEN_CACHE_PATH = path.join(stableDir, 'token-cache.json');
}
if (!process.env.MS365_MCP_SELECTED_ACCOUNT_PATH) {
  process.env.MS365_MCP_SELECTED_ACCOUNT_PATH = path.join(stableDir, 'selected-account.json');
}

const hookUrl = pathToFileURL(path.join(__dirname, 'disable-keytar.mjs')).href;
const inject = `--experimental-loader=${hookUrl} --no-warnings`;
process.env.NODE_OPTIONS = process.env.NODE_OPTIONS
  ? `${process.env.NODE_OPTIONS} ${inject}`
  : inject;

try {
  installLoginScripts();
} catch (err) {
  console.error(`[ms365] login script install skipped: ${err.message}`);
}

const isWindows = process.platform === 'win32';
const pkg = '@softeria/ms-365-mcp-server';
const passthrough = process.argv.slice(2);
const serverArgs = ['-y', pkg, '--org-mode', ...passthrough];

const command = isWindows ? 'cmd' : 'npx';
const args = isWindows ? ['/c', 'npx', ...serverArgs] : serverArgs;

const child = spawn(command, args, {
  stdio: 'inherit',
  env: process.env,
  windowsHide: true,
});

child.on('error', (err) => {
  console.error(`[ms365] failed to start MCP server: ${err.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => child.kill(sig));
}

// ---------------------------------------------------------------------------

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const text = fs.readFileSync(filePath, 'utf8');
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

function missingVars() {
  return REQUIRED_VARS.filter((k) => !process.env[k] || process.env[k].trim() === '');
}

function writeTemplateIfMissing() {
  try {
    fs.mkdirSync(SECRETS_DIR, { recursive: true, mode: 0o700 });
    if (!fs.existsSync(SECRETS_TEMPLATE)) {
      fs.writeFileSync(SECRETS_TEMPLATE,
`# Microsoft 365 credentials for the ms365 plugin.
#
# How to use:
#   1. Fill in the three values below.
#   2. Rename this file to ms365.env (drop the .template suffix).
#   3. Restart Claude Code.
#
# Where to get the values (Azure Portal → App Registrations → your app):
#   - "Application (client) ID"  → MS365_MCP_CLIENT_ID
#   - "Directory (tenant) ID"    → MS365_MCP_TENANT_ID
#   - Certificates & secrets → New client secret → "Value" column
#                              → MS365_MCP_CLIENT_SECRET
#
# This file is read by run.js and login.mjs at startup. Keep it private
# (default mode 0600) — do not commit it.

MS365_MCP_CLIENT_ID=
MS365_MCP_TENANT_ID=
MS365_MCP_CLIENT_SECRET=
`, { mode: 0o600 });
    }
  } catch (err) {
    // best effort — if we can't write the template, just print the same
    // contents to stderr below.
  }
}

function ensureSecretsOrExit() {
  if (missingVars().length === 0) return;
  loadEnvFile(SECRETS_FILE);
  if (missingVars().length === 0) return;

  writeTemplateIfMissing();
  const still = missingVars();
  console.error('');
  console.error('[ms365] Missing Microsoft 365 credentials: ' + still.join(', '));
  console.error('');
  console.error('  This plugin needs an Azure AD app registration to talk to');
  console.error('  Microsoft Graph. Put the values in:');
  console.error('         ' + SECRETS_FILE);
  console.error('');
  console.error('  A template has been created at:');
  console.error('         ' + SECRETS_TEMPLATE);
  console.error('');
  console.error('  Steps:');
  console.error('    1. Open the template, fill in the three values, save it as');
  console.error('       ms365.env (no .template suffix) in the same directory.');
  console.error('    2. Restart Claude Code so the MCP server picks up the values.');
  console.error('');
  console.error('  Where to get the values (Azure Portal → App Registrations):');
  console.error('    - "Application (client) ID"  → MS365_MCP_CLIENT_ID');
  console.error('    - "Directory (tenant) ID"    → MS365_MCP_TENANT_ID');
  console.error('    - Certificates & secrets → New client secret → "Value"');
  console.error('                              → MS365_MCP_CLIENT_SECRET');
  console.error('');
  process.exit(1);
}

function installLoginScripts() {
  fs.mkdirSync(stableDir, { recursive: true, mode: 0o700 });

  // Copy the heavy lifters: hook + login.mjs + clipboard helper.
  for (const f of ['disable-keytar.mjs', 'login.mjs', 'clip-login-cmd.mjs']) {
    fs.copyFileSync(path.join(__dirname, f), path.join(stableDir, f));
  }

  // Tiny POSIX wrapper: invoke the Node script. login.mjs loads
  // ~/.claude/.env/ms365.env itself, so no credential plumbing here.
  const sh = `#!/bin/bash
# ms365 — Microsoft 365 Login (terminal). Auto-installed by run.js.
# All UX (browser auto-open, clipboard auto-copy) lives in login.mjs.
# Credentials are loaded by login.mjs from ~/.claude/.env/ms365.env.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
exec node "$HERE/login.mjs"
`;
  fs.writeFileSync(path.join(stableDir, 'login.sh'), sh, { mode: 0o755 });

  // Tiny Windows wrapper: same idea + pause so the window stays open.
  const cmd = `@echo off
REM ms365 -- Microsoft 365 Login (terminal). Auto-installed by run.js.
REM All UX (browser auto-open, clipboard auto-copy) lives in login.mjs.
REM Credentials are loaded by login.mjs from %USERPROFILE%\\.claude\\.env\\ms365.env.
setlocal
cd /d "%~dp0"
node "%~dp0login.mjs"
set "RC=%ERRORLEVEL%"
echo.
pause
endlocal & exit /b %RC%
`;
  fs.writeFileSync(path.join(stableDir, 'login.cmd'), cmd);
}
