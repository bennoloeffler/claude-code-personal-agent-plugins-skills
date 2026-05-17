# ai-ms365

Plugin for Microsoft 365 (Outlook, Calendar, Teams, SharePoint, OneDrive) via the
[@softeria/ms-365-mcp-server](https://github.com/Softeria/ms-365-mcp-server).

Cross-platform wrapper that handles npx differences between macOS/Linux and Windows, forces
file-based token caching so the in-cowork device-code login persists, and loads its Azure AD
credentials from `~/.claude/.env/ms365.env` (you provide your own — none are embedded).

## What it does

- Exposes MS365 tools as an MCP server (`mcp__ms365__*`)
- Works on macOS, Linux and Windows from a single configuration
- `--org-mode` is on by default (Teams / SharePoint tools available)

## Requirements

- Node.js (≥ 18 recommended) — `node` and `npx` must be on `PATH`
- Your own Azure AD app registration (see "First-time setup" below)
- On Windows: no extra configuration needed (wrapper handles `cmd /c npx`)

## First-time setup — supply your own Azure AD credentials

This plugin does **not** ship with embedded Azure credentials. You must register your own
Azure AD application and provide the three values: client ID, tenant ID, client secret.

1. **Install the plugin.** Start Claude Code once. The MCP server boots, detects that the
   credentials are missing, prints clear instructions and exits — and writes a starter
   template at:

   ```
   ~/.claude/.env/ms365.env.template
   ```

2. **Register an Azure AD app** (one-time, in the Azure Portal):
   - Azure Portal → App Registrations → **New registration**
   - Name: anything (e.g. `claude-code-ms365`)
   - Supported account types: pick what fits your tenant
   - Redirect URI: not needed for device-code flow
   - After creation, copy:
     - **Application (client) ID** → `MS365_MCP_CLIENT_ID`
     - **Directory (tenant) ID** → `MS365_MCP_TENANT_ID`
   - Certificates & secrets → **New client secret** → copy the **Value** column
     → `MS365_MCP_CLIENT_SECRET`
   - API permissions: add the Microsoft Graph delegated permissions you need
     (Mail.ReadWrite, Mail.Send, Calendars.ReadWrite, Files.ReadWrite, etc.)

3. **Copy the template and fill it in:**

   ```bash
   cp ~/.claude/.env/ms365.env.template ~/.claude/.env/ms365.env
   # then edit ~/.claude/.env/ms365.env with the three values
   ```

   The file should look like:

   ```
   MS365_MCP_CLIENT_ID=...
   MS365_MCP_TENANT_ID=...
   MS365_MCP_CLIENT_SECRET=...
   ```

   File mode `0600` (only your user can read it). Do not commit it.

4. **Restart Claude Code.** The MCP server will pick up the new values from
   `~/.claude/.env/ms365.env` and start normally.

> Why a separate file under `~/.claude/.env/`? Secrets stay outside the plugin directory, so
> they survive plugin reinstalls/upgrades and never end up in a repository by accident.

## Verify

After starting Claude Code:

```
/mcp
```

Should show `ms365` as a connected server. Tools appear as `mcp__ms365__*`.

Quick test: ask "list my last 5 mails" — the first MS365 call triggers the device-code login
flow below.

## First-time login — once, in a terminal

Cowork (Claude Code) **cannot** complete the device-code login on its own. The MCP `login`
tool prints the URL + code, but the 1–15 minute polling that follows is killed when the MCP
sandbox tears the server down (~1 min after the tool call returns). Microsoft never sends
the token to anyone.

**Workaround:** run the login once from a normal terminal. Because cowork installs the
plugin into a randomized sandbox path (`~/Library/Application Support/Claude/local-agent-mode-sessions/<uuid>/<uuid>/rpm/plugin_<random>/`),
`run.js` auto-installs a stand-alone login script at a **stable** per-user location.

| OS | Command |
|---|---|
| macOS / Linux | `bash ~/.config/ms-365-mcp/login.sh` |
| Windows | `%USERPROFILE%\.config\ms-365-mcp\login.cmd` (or double-click in Explorer) |

The script:

1. Spawns the MS365 MCP server in `--login` mode
2. Parses the device-code line as it appears, and:
   - **Opens the browser automatically** (`open` on macOS, `start` on Windows, `xdg-open` on Linux)
   - **Copies the code to clipboard** (`pbcopy` / `clip` / `xclip`)
3. Also prints URL and code prominently in the terminal — in case auto-open / auto-copy fail
4. Waits until the user finishes in the browser (polling runs safely here — no sandbox kill)
5. Writes the token to a per-user file (not the keychain):
   - macOS / Linux: `~/.config/ms-365-mcp/token-cache.json`
   - Windows: `%USERPROFILE%\.config\ms-365-mcp\token-cache.json`
6. The MCP server inside cowork reads the token from that file on the next call

So the user only has to: open a terminal, paste, hit Enter — then in the browser just press
`⌘+V` / `Ctrl+V`, sign in, done.

**If `~/.config/ms-365-mcp/login.sh` does not exist yet** (fresh install, cowork never
started): start cowork once and make any MS365 call (e.g. `/ai-ms365 verify`). `run.js`
installs the scripts on server boot.

The token file has mode `0600` (owner only) and contains the MSAL refresh token. It survives
cowork restarts and sessions. You only need to re-login when:

- you call `mcp__ms365__logout` explicitly
- the refresh token rotates (Microsoft policy)
- the Azure client secret rotates

### Why a file instead of Keychain?

The upstream server has a keytar→file fallback. The wrapper (`run.js`) forces that fallback
unconditionally via a Node loader hook (`disable-keytar.mjs`) that makes `import("keytar")`
throw. Deterministic, platform-independent behaviour:

- macOS: no keychain prompt, no sandbox conflict
- Windows: keytar is often not installed (native add-on needs VS Build Tools) — the hook is
  a deterministic safeguard
- Linux: works without libsecret

Override with env vars `MS365_MCP_TOKEN_CACHE_PATH` / `MS365_MCP_SELECTED_ACCOUNT_PATH` if
you want a different path.

## Platform differences (documented for maintainers)

| Aspect | macOS / Linux | Windows |
|---|---|---|
| Direct `npx` spawn | works | fails (npx is `npx.cmd`, not directly spawnable without `shell:true`) |
| Wrapper solution (`run.js`) | `spawn('npx', [...])` | `spawn('cmd', ['/c', 'npx', ...])` |
| `.mcp.json` | identical | identical |
| Keytar | disabled by loader hook | usually not installed; hook is a safeguard |

Sources for the Windows quirk:
- <https://github.com/modelcontextprotocol/servers/issues/3460>
- <https://github.com/SuperClaude-Org/SuperClaude_Framework/issues/390>
- <https://github.com/Softeria/ms-365-mcp-server#installation> (official recommendation `cmd /c npx ...`)

## Usage in Claude Code

- **Slash command:** `/ai-ms365 last 5 mails` or `/ai-ms365 schedule a meeting tomorrow at 2pm with someone@example.com`
  - `/ai-ms365 login` — re-run device-code login
  - `/ai-ms365 verify` — check login status
  - `/ai-ms365 tools` — list available MS365 tools
- **Automatic:** when an MS365 topic comes up in conversation (mail, calendar, teams,
  sharepoint, onedrive), the `ai-ms365` skill auto-activates and tells Claude which
  `mcp__ms365__*` tools to use.

## Layout

```
ai-ms365/
├── .claude-plugin/plugin.json   Plugin manifest
├── .mcp.json                    MCP entry (no embedded credentials)
├── run.js                       Launcher: cross-platform spawn + keytar hook +
│                                env-file loader + auto-install of login scripts
│                                into ~/.config/ms-365-mcp/
├── login.mjs                    User-friendly login with browser auto-open + clipboard copy
├── disable-keytar.mjs           ESM loader hook that disables keytar → forces file cache
├── clip-login-cmd.mjs           Copies the OS-correct login command to the clipboard
├── skills/ai-ms365/SKILL.md      Skill: tool overview, patterns, pitfalls
├── commands/ai-ms365.md          Slash command /ai-ms365 <free text>
├── commands/ai-ms365-login.md    Slash command /ai-ms365-login (terminal-login guide)
├── README.md                    This file
├── .env.example                 Reference for the secrets file format
└── .gitignore

Auto-installed on first cowork start (by run.js):
~/.config/ms-365-mcp/
├── disable-keytar.mjs           Copy from the plugin
├── login.mjs                    Copy from the plugin (the actual login script)
├── clip-login-cmd.mjs           Copy from the plugin
├── login.sh                     Tiny wrapper (mac/Linux): runs login.mjs
└── login.cmd                    Tiny wrapper (Windows): same + pause at end

Credentials (provided by you):
~/.claude/.env/ms365.env         MS365_MCP_CLIENT_ID / TENANT_ID / CLIENT_SECRET (mode 0600)
```

## Rotating the client secret

1. Azure Portal → App Registration → Certificates & secrets → new secret
2. Update `MS365_MCP_CLIENT_SECRET` in `~/.claude/.env/ms365.env`
3. Restart Claude Code

## Security

- Credentials live in `~/.claude/.env/ms365.env` (mode 0600), never in the plugin
  directory and never committed to version control.
- The Azure AD app you register only has the Graph permissions you grant it — start with
  the minimum needed.
- The refresh token in `~/.config/ms-365-mcp/token-cache.json` is also `0600`.
