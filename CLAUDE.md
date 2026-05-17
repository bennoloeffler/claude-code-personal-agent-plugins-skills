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

Marketplace `ai-plugins` is live in `.claude-plugin/marketplace.json` with two real plugins and one skill bundle:

| Entry | Type | What it does |
|---|---|---|
| `ai-heartbeat-timer` | real plugin (MCP + skill + hook) | Self-ticking cron. `timer.md` → recurring prompts via channel events. |
| `ai-ms365` | real plugin (MCP + skill + commands) | Microsoft 365 (Outlook, Calendar, Teams, SharePoint, OneDrive). User supplies own Azure AD creds at `~/.claude/.env/ms365.env`. |
| `ai-create` | skill bundle | `ai-create-image`, `ai-create-image-set`, `ai-create-diagram`, `ai-create-slide-deck-variants`. User supplies own OpenAI key at `~/.claude/.env/<skill>.env`. |

`todo-ideas/` is gone for now (nothing in flight). Recreate it if you start something new.

## Project intent

Per `README.md`, this repo hosts **public** plugins and skills that let anyone run Claude Code as an always-on personal assistant: connected to email/calendar/files, reachable via mobile messaging, driven by daily/weekly timers, with persistent memory.

Keep each plugin/skill generic and reusable — no embedded credentials, no organization-specific defaults.

## Repo structure

```
.
├── .claude-plugin/marketplace.json    # Marketplace catalog
├── skills/                            # Standalone skills (agentskills.io core spec)
├── plugins/                           # Real plugins (commands/agents/hooks/MCP)
├── todo-ideas/                        # (Optional) sandbox for WIP — recreate when needed
├── docs/                              # Conventions, development workflow, publishing
└── .github/workflows/                 # CI (e.g. validate-plugins.yml)
```

When starting new work, stage it under `todo-ideas/skills/` or `todo-ideas/plugins/` first; promote to `skills/` or `plugins/` only when stable. Marketplace entry only when ready for subscribers.

## Naming — `ai-` prefix everywhere

**Hard rule for this repo:** every plugin, skill, and slash command name starts with `ai-`. No exceptions. Lowercase, hyphens only, no underscores.

| Kind | Pattern | Examples |
|---|---|---|
| Plugin directory | `ai-<name>` | `plugins/ai-heartbeat-timer/`, `plugins/ai-ms365/` |
| `plugin.json` `name` field | `ai-<name>` | `"name": "ai-heartbeat-timer"` |
| Skill directory | `ai-<name>` | `skills/ai-timer/`, `skills/ai-ms365/` |
| `SKILL.md` frontmatter `name` | `ai-<name>` | `name: ai-timer` |
| Slash command file | `commands/ai-<name>.md` | `commands/ai-ms365.md`, `commands/ai-ms365-login.md` |
| Slash command invocation | `/ai-<name>` | `/ai-timer`, `/ai-ms365` |
| Marketplace plugin entries | `ai-<name>` | matches the directory |

Why: in Claude Code's UI, the user types `/` and sees a long list of slash commands from every installed plugin. With the `ai-` prefix, everything from this repo's family clusters together — typing `/ai-` filters to just our plugins. Same for skill auto-trigger lists and marketplace listings.

**Do NOT use** as prefixes: personal initials, company names, organization-specific tags, or anything that ties the plugin to a specific team. Public marketplace, neutral names only.

If you're importing a plugin from somewhere that uses a different prefix, strip the old prefix and add `ai-` during the import. Update the directory name, file names, `plugin.json` name, `SKILL.md` frontmatter, and every cross-reference (slash-command examples, channel strings like `plugin:<name>@ai-plugins`, install commands).

Runtime state directories created by a plugin in user projects (e.g. `.ai-heartbeat-timer/`) should also be named after the plugin so users can grep `.ai-` to find what each plugin writes to their working tree.

## Skill conventions

### Authoritative spec — Anthropic Claude Code docs

The canonical SKILL.md specification lives at **<https://code.claude.com/docs/en/skills>**. Read it whenever you're authoring, reviewing, or validating a skill in this repo — that page is the source of truth, not third-party skill-authoring docs (which often state a stricter subset).

**Frontmatter — all fields are OPTIONAL.** Only `description` is recommended. Reference table copied from the Anthropic docs:

| Field | Required | Description |
|---|---|---|
| `name` | No | Display name. If omitted, uses directory name. Lowercase, digits, hyphens only. Max 64 chars. |
| `description` | Recommended | What the skill does AND when to use it. Combined with `when_to_use` capped at **1,536 chars** in the listing. Put the key use case first. |
| `when_to_use` | No | Additional trigger phrases / example requests. Appended to `description` in the listing; shares the 1,536-char cap. |
| `argument-hint` | No | Autocomplete hint, e.g. `[issue-number]` or `[filename] [format]`. **(Valid — do not strip it.)** |
| `arguments` | No | Named positional arguments for `$name` substitution. Space-separated string or YAML list. |
| `disable-model-invocation` | No | `true` = only the user can invoke (`/skill-name`). Removes description from context. Default `false`. |
| `user-invocable` | No | `false` = hidden from `/` menu (Claude-only). Default `true`. |
| `allowed-tools` | No | Tools Claude can use without per-call approval while the skill is active. Space-separated string or YAML list. |
| `model` | No | Model override for the current turn. Same values as `/model`, or `inherit`. |
| `effort` | No | Effort level override: `low`, `medium`, `high`, `xhigh`, `max`. |
| `context` | No | `fork` to run in a forked subagent context. |
| `agent` | No | Which subagent type to use when `context: fork` (e.g. `Explore`, `Plan`, `general-purpose`, or a custom one). |
| `hooks` | No | Hooks scoped to this skill's lifecycle. |
| `paths` | No | Glob patterns that gate auto-activation by working file. Comma-separated string or YAML list. |
| `shell` | No | `bash` (default) or `powershell` for `` !`…` `` blocks. |

**String substitutions inside the skill body:** `$ARGUMENTS`, `$ARGUMENTS[N]`, `$N`, `$<named>`, `${CLAUDE_SESSION_ID}`, `${CLAUDE_EFFORT}`, `${CLAUDE_SKILL_DIR}`. Use `${CLAUDE_SKILL_DIR}` (not `$CWD` or relative paths) when a skill references its own bundled scripts — it resolves correctly whether the skill is installed at user, project, or plugin level.

**Dynamic context injection:** ``!`<cmd>` `` runs a shell command at skill-load time and inlines its stdout into the prompt (e.g. ``!`git diff HEAD` ``). For multi-line use a ` ```! ` fenced block. Substitution runs **once**, not recursively.

**Supporting files** — the spec is permissive. The official examples include `template.md`, `examples/sample.md`, `scripts/validate.sh`. The Anthropic docs do not forbid `README.md` in a skill directory; third-party authoring guides (e.g. `document-skills:skill-creator`) often state a stricter "SKILL.md + bundled resources only" rule — that is opinion, not spec. Reference supporting files from `SKILL.md` so Claude knows what they contain.

**Body length:** Anthropic docs include a `<Tip>` recommending `SKILL.md` under 500 lines and moving detail to separate files. It is a tip, not a hard limit.

**Skill content lifecycle (important — read this before authoring):** A loaded SKILL.md stays in context for the rest of the session as a single message. Anthropic does NOT re-read the file on later turns. Write standing instructions, not one-time steps. Auto-compaction re-attaches the first 5,000 tokens of the most recent invocation of each skill, with 25,000 tokens shared budget for all re-attached skills. If a skill seems to "wear off" — strengthen the `description` so Claude keeps preferring it, or use hooks to enforce behavior.

**Description budget — gotcha:** All skill names are always listed; descriptions are truncated when the cumulative listing exceeds 1% of the model's context window (configurable via `skillListingBudgetFraction` / `SLASH_COMMAND_TOOL_CHAR_BUDGET`). Run `/doctor` to see whether the budget overflows. To free budget for high-priority skills, set low-priority ones to `"name-only"` via `skillOverrides` in `.claude/settings.local.json`.

**Related docs (also authoritative):**
- Skills overview: <https://code.claude.com/docs/en/skills>
- Subagents (relevant for `context: fork` skills): <https://code.claude.com/docs/en/sub-agents>
- Hooks (for the `hooks` frontmatter field): <https://code.claude.com/docs/en/hooks>
- Plugins: <https://code.claude.com/docs/en/plugins>
- Permissions (governs `allowed-tools` enforcement): <https://code.claude.com/docs/en/permissions>
- Settings (`skillOverrides`, `skillListingBudgetFraction`): <https://code.claude.com/docs/en/settings>
- Agent Skills open standard (cross-tool baseline): <https://agentskills.io>

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
| `~/.claude/.env/<plugin>.env` | **Standard secrets location for this repo.** Per-user API keys / OAuth client secrets / etc. for a specific plugin. Plugin reads it at startup; mode `0600`. |
| `~/.claude/.env/<plugin>.env.template` | Plugin-written starter that the user copies to `<plugin>.env` and fills in. Created on first run when the real file is missing. |
| `~/.<app>/<provider>-auth.json` | OAuth refresh tokens written by the skill/plugin itself (separate from user-provided secrets). |

Resolution order: **environment variable already set → `~/.claude/.env/<plugin>.env` → bail out with instructions**. Never embed live credentials in the plugin source.

### `~/.claude/.env/` — the standard secrets directory

All plugins and skills in this repo store **user-supplied secrets** under `~/.claude/.env/`:

- One file per plugin: `~/.claude/.env/<plugin-name>.env`, KEY=VALUE format, mode `0600`.
- The plugin's `.mcp.json` must **not** contain an `env` block with secret values. The launcher (e.g. `run.js`) loads from `~/.claude/.env/<plugin-name>.env` instead.
- On first run, if the env file or any required key is missing:
  1. Write a `<plugin-name>.env.template` next to it (with comments explaining each variable and where to get the values).
  2. Print clear instructions to stderr (file path, what to fill in, how to obtain values, that Claude Code must be restarted afterwards).
  3. Exit non-zero. Do **not** silently fall back to broken defaults.
- The launcher should accept an already-set environment variable as an override (don't overwrite if the key is in `process.env`), so power users can set values via shell profile.

This keeps secrets:
- Outside the plugin directory (survives reinstall/upgrade).
- Outside any git repo (not accidentally committed).
- Inside a single well-known location the user can audit (`ls ~/.claude/.env/`).
- Discoverable via the template-on-first-run pattern (the user doesn't have to read docs to find out what's needed).

Token caches written by the plugin at runtime (OAuth refresh tokens, session state) go somewhere else — `~/.config/<plugin>/` or `~/.<plugin>/` — so they don't get conflated with user-supplied secrets.

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

## `.ai-heartbeat-timer/` / `.heartbeat-timer/` directories

Runtime state from the heartbeat-timer plugin — **not source code in this repo**. The staged plugin in `todo-ideas/plugins/ai-heartbeat-timer/` writes to `.ai-heartbeat-timer/`. An older externally-installed `heartbeat-timer` plugin (pre-rename) writes to `.heartbeat-timer/` — that legacy directory may still exist at the repo root from previous runs.

Contents (in either dir):

- `heartbeat.lock` — leader-election lock
- `heartbeat.log` — tick log
- `status-<instance>.txt` — per-instance status

The log shows the plugin tries to read a `timer.md` at the repo root that does not exist. If scheduled prompts are wanted while this directory is the working directory, create `timer.md` in the plugin's expected format — but ask first and review for personal data before committing.

Do not hand-edit these files. They should be **gitignored**, not committed. Same for any `timer.md` that contains personal scheduling.

## What goes in `.gitignore`

Once a `.gitignore` exists, at minimum:

```
# Runtime state (heartbeat plugin — new name + legacy)
.ai-heartbeat-timer/
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
