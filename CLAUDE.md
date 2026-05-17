# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## This repo is PUBLIC

Everything committed here is world-readable. Treat any change as a public release.

**Never commit:**

- Personal names, email addresses, social handles, phone numbers, or other identifying info
- Company names, customer names, internal project codenames, branding, or org-specific URLs
- API keys, tokens, passwords, OAuth client secrets, webhook URLs with embedded secrets, bot tokens, account IDs, Telegram chat IDs
- Absolute paths from a developer machine (e.g. `/Users/<name>/...`) — use `~/` or generic placeholders
- References to private sibling repositories or non-public infrastructure
- OS-specific shortcuts without a cross-platform pendant (e.g. `nohup`/`&` with no PowerShell equivalent)

If something is even arguably sensitive, ask before committing. Skills and plugins here must be **generic, configurable, and self-contained** so any reader can install and use them without belonging to a specific organization.

## Current state

Early-stage stub. Only `README.md` (vision) and `.heartbeat-timer/` (runtime state from an externally-installed plugin) exist. No source code, no build system, no tests, no marketplace manifest yet.

Do not invent commands or claim infrastructure that does not exist. If asked to build/test/release, say nothing is set up yet and ask what should be scaffolded first.

## Project intent

Per `README.md`, this repo will host **public** plugins and skills that let anyone run Claude Code as an always-on personal assistant: connected to email/calendar/files, reachable via mobile messaging, driven by daily/weekly timers, with persistent memory.

The plugins and skills themselves are the deliverable. Keep each one generic and reusable.

## Intended repo structure

When content lands, follow this layout (mirrors the Anthropic plugin-marketplace pattern):

```
.
├── .claude-plugin/marketplace.json    # Marketplace catalog (what subscribers see)
├── skills/                            # Standalone skills (agentskills.io core spec)
├── plugins/                           # Real plugins (commands/agents/hooks/MCP)
├── todo-ideas/                        # Sandbox — NOT listed in marketplace
│   ├── skills/                        # WIP skills
│   └── plugins/                       # WIP plugins
├── docs/                              # Conventions, development workflow, publishing
└── .github/workflows/                 # CI (e.g. validate-plugins.yml)
```

`todo-ideas/` is a sandbox — work-in-progress goes there first, gets promoted to `skills/` or `plugins/` only when stable and listed in `marketplace.json` only when ready for subscribers.

## Naming

Pick a short prefix per collection (e.g. `agent-`, `pa-`, or whatever fits the public brand) and use it consistently: `<prefix>-<block>-<function>`, lowercase, hyphens only. Skill bundles can carry just the block name (`<prefix>-<block>`). Do not use personal or company initials as the prefix.

## Skill conventions

### Gate pattern (required for skills with preflight)

Every skill that needs to install prerequisites checks two markers at its root before running:

| Marker | Meaning |
|---|---|
| `SKILL_INSTALLED.md` | Preflight succeeded — skill may run |
| `SKILL_INSTALL_FAILED.md` | Last preflight failed — content explains cause + remediation |

Flow:

```
exists(SKILL_INSTALLED.md)?
├── yes → run normally
└── no
    exists(SKILL_INSTALL_FAILED.md)?
    ├── yes → show its content, do NOT silently retry install
    └── no  → run preflight (writes one of the two markers)
```

Silent auto-retry on install failure is forbidden — surface the failure and let the user act.

### Preflight + cross-platform

A complete skill ships under `scripts/`:

- `preflight.sh` + `preflight.ps1` — Bash/PowerShell bootstraps (must be functionally equivalent)
- `preflight-core.mjs` — Node logic doing the actual checks and installs
- `doctor.mjs` — read-only healthcheck (no installs, no writes)
- `install-macos.sh` + `install-windows.ps1` — optional one-shot installers

Preflight installs prerequisites via `brew` / `winget` / `npm` / `pip` with a live log, then writes one of the gate markers.

**Cross-platform is mandatory.** Every Bash construct needs a PowerShell equivalent (and vice versa). No Linux-only or macOS-only code paths without a Windows counterpart.

Note that on some developer machines Homebrew coreutils is ahead of system tools in `PATH`, so `date`/`sed`/`readlink` become GNU. Don't assume either flavor — try one syntax and fall back to the other, or use `python3`/`perl` when the logic is non-trivial.

### Configuration

| Location | Contents |
|---|---|
| `<skill>/config/*.default.env` | Defaults shipped with the skill (no secrets — repo is public) |
| `~/.<app>/config.env` (or similar XDG-style path) | Per-user overrides for static keys |
| `~/.<app>/<provider>-auth.json` | OAuth refresh tokens written by the skill itself |

Resolution order: **user override → default → environment variable**. Pick a neutral, public-safe app dir name; do not embed a company name.

### Auth patterns

- **Pattern A — Static API key.** User puts their own key in the override file. The default file ships with no key (or a placeholder). Suitable for personal/individual API access.
- **Pattern B — OAuth 2.0 PKCE.** First preflight opens a browser login per user; refresh token persisted locally; subsequent calls silent. Suitable for per-user audit trails (Dropbox, Google, Microsoft, etc.).

Never ship credentials in this repo. Defaults file must be empty/placeholder for any secret field.

## Plugin conventions

### Skill bundles vs real plugins

Two entry shapes in the same `marketplace.json`:

```jsonc
{
  "name": "<prefix>-<block>",                 // Skill bundle — no plugin dir
  "source": "./",
  "skills": ["./skills/<prefix>-foo", "./skills/<prefix>-bar"]
},
{
  "name": "<plugin-name>",                    // Real plugin — own dir
  "source": "./plugins/<plugin-name>"
}
```

- **Skill bundles** group related skills from `skills/` without duplicating files. No `plugin.json` needed. Pattern taken from Anthropic's official `anthropics/skills` repo.
- **Real plugins** live in `plugins/<name>/` with `.claude-plugin/plugin.json` and optionally `.mcp.json`, `hooks/`, `agents/`, `commands/`, and arbitrary code subdirs.

### Path resolution in plugins

Resolve paths via `${CLAUDE_PLUGIN_ROOT}`. Never use `import.meta.dir/../..` or hardcoded relative paths — they break when the plugin is installed into a different location.

## What this repo runs

### Development

Locally test a plugin via:

```
claude --plugin-dir todo-ideas/plugins/<name>
```

Or a local marketplace:

```
/plugin marketplace add file://$PWD/.claude-plugin/marketplace.json
```

### Promotion workflow

1. Build skill/plugin in `todo-ideas/`.
2. Test locally (install into `~/.claude/skills/<name>/` for skills; `--plugin-dir` for plugins).
3. When stable: move to `skills/` or `plugins/`.
4. Add entry to `.claude-plugin/marketplace.json`.
5. Update `CHANGELOG.md`.
6. Commit.

## `.heartbeat-timer/` directory

Runtime state from an externally-installed `heartbeat-timer` plugin — **not source code in this repo**.

- `heartbeat.lock` — leader-election lock
- `heartbeat.log` — tick log
- `status-<instance>.txt` — per-instance status

The log shows the plugin tries to read a `timer.md` at the repo root that does not exist. If scheduled prompts are wanted while this directory is the working directory, create `timer.md` in the heartbeat-timer plugin's expected format — but ask first and review for personal data before committing.

Do not hand-edit `.heartbeat-timer/` files. They should be **gitignored**, not committed. Same for any `timer.md` that contains personal scheduling.

## What goes in `.gitignore`

Once a `.gitignore` exists, at minimum:

```
# Runtime state
.heartbeat-timer/
*.lock

# Personal scheduling
timer.md

# Per-user config and secrets (never committed)
.env
.env.local
*.secrets.env
*-auth.json

# OS / editor
.DS_Store
.vscode/
.idea/
```

## When asked to "migrate from another repo"

If asked to import skills/plugins from a private sibling repo:

1. **Read-only on the source.** No git ops, no moves, no deletions on the source repo — copy only.
2. **Sanitize before commit.** Strip names, emails, phone numbers, chat IDs, OAuth client secrets, internal URLs, company-specific defaults, absolute paths. Replace with placeholders.
3. **Stage in `todo-ideas/`** first. Promotion to `skills/`/`plugins/` happens only after sanitization review.
4. **Never push, tag, or release** without explicit user confirmation.
