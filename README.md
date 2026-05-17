# claude-code-personal-agent-plugins-skills

Plugins and skills to turn Claude Code into a 24/7 personal assistant.

Every plugin and skill in this marketplace starts with the **`ai-`** prefix — type `/ai-` in Claude Code and the whole collection clusters together.

## What's in the marketplace

| Entry | Type | What it does |
|---|---|---|
| **`ai-heartbeat-timer`** | real plugin (MCP) | Self-ticking cron. Define recurring prompts in `timer.md`; a bundled MCP server fires them into your session as `<channel>` events. Includes the `/ai-timer` skill for natural-language timer management. |
| **`ai-ms365`** | real plugin (MCP + skill + commands) | Microsoft 365 (Outlook, Calendar, Teams, SharePoint, OneDrive) via `@softeria/ms-365-mcp-server`. Cross-platform npx wrapper. Bring your own Azure AD app credentials. |
| **`ai-create`** | skill bundle | Image / diagram / slide-deck generation: `ai-create-image` (gpt-image-1), `ai-create-image-set` (consistent series for slide backgrounds), `ai-create-diagram` (D2 → SVG/PNG), `ai-create-slide-deck-variants` (10 HTML deck aesthetics — Reveal.js + WebSlides). Bring your own OpenAI key. |

## Install

```
/plugin marketplace add <owner>/<this-repo>
/plugin install ai-heartbeat-timer@ai-plugins
/plugin install ai-ms365@ai-plugins
/plugin install ai-create@ai-plugins
```

After the marketplace is added, you also get the bundled skills (`/ai-timer`, `/ai-ms365`, `/ai-ms365-login`, `/ai-create-*`) and commands by default.

## Secrets

User-supplied secrets live in **`~/.claude/.env/<plugin>.env`** (one file per plugin, mode `0600`). On first run, each plugin that needs credentials writes a `.template` next to its expected env file and exits with instructions — no embedded credentials anywhere in this repo.

| Plugin / skill | Secrets file |
|---|---|
| `ai-ms365` | `~/.claude/.env/ms365.env` (Azure AD client ID / tenant / secret) |
| `ai-create-image` | `~/.claude/.env/ai-create-image.env` (`OPENAI_API_KEY`) |
| `ai-create-image-set` | `~/.claude/.env/ai-create-image-set.env` (`OPENAI_API_KEY`) |

## Channels (`ai-heartbeat-timer`)

The heartbeat plugin pushes prompts into your session via the experimental `claude/channel` MCP capability. That capability is **gated** — you must start Claude Code with `--dangerously-load-development-channels plugin:ai-heartbeat-timer@ai-plugins` (or use the org-managed allowlist on Team plans). See [`plugins/ai-heartbeat-timer/README.md`](plugins/ai-heartbeat-timer/README.md) for the full gate explanation and shell-alias setup.

## Structure

```
.
├── .claude-plugin/marketplace.json    Marketplace catalog
├── plugins/
│   ├── ai-heartbeat-timer/            Real plugin (MCP server + skill + hook)
│   └── ai-ms365/                      Real plugin (MCP server + skill + commands)
├── skills/
│   ├── ai-create-diagram/
│   ├── ai-create-image/
│   ├── ai-create-image-set/
│   └── ai-create-slide-deck-variants/
└── CLAUDE.md                          Repo conventions for Claude Code
```

## Conventions (summary — full version in `CLAUDE.md`)

- **`ai-` prefix everywhere.** Plugin names, skill names, slash commands.
- **No embedded credentials.** Secrets live at `~/.claude/.env/<plugin>.env`. Plugins fail loud on first run when missing, with a template + instructions.
- **Cross-platform mandatory.** Every Bash construct has a PowerShell pendant. macOS / Linux / Windows out of the box.
- **Gate pattern for skills with preflight.** `SKILL_INSTALLED.md` / `SKILL_INSTALL_FAILED.md` markers; no silent retry on install failure.

## License

MIT.
