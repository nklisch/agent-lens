---
title: MCP Configuration
description: Configure Krometrail as an MCP server for Claude Code, Codex, Cursor, and Windsurf.
---

# MCP Configuration

Krometrail exposes all its capabilities as MCP tools. Once configured, agents discover `debug_*`, `chrome_*`, and `session_*` tools automatically — no prompting required.

## Claude Code

Add to `.mcp.json` in your project root (shared with your team), or use the CLI:

```bash
claude mcp add --transport stdio --scope project krometrail -- npx krometrail@latest --mcp
```

::: code-group

```json [bunx]
{
	"mcpServers": {
		"krometrail": {
			"command": "bunx",
			"args": ["krometrail@latest", "--mcp"]
		}
	}
}
```

```json [npx]
{
	"mcpServers": {
		"krometrail": {
			"command": "npx",
			"args": ["krometrail@latest", "--mcp"]
		}
	}
}
```

```json [binary]
{
	"mcpServers": {
		"krometrail": {
			"command": "/path/to/krometrail",
			"args": ["--mcp"]
		}
	}
}
```

:::

Claude discovers the `debug_*` tools automatically. No CLAUDE.md changes needed.

## Cursor

Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` in your project root:

```json
{
	"mcpServers": {
		"krometrail": {
			"command": "npx",
			"args": ["krometrail@latest", "--mcp"]
		}
	}
}
```

Restart Cursor after saving. The `debug_*` tools will appear in the AI's tool list.

## Windsurf

Add to `~/.codeium/windsurf/mcp_config.json` or click the MCPs icon in Cascade and select "Configure":

```json
{
	"mcpServers": {
		"krometrail": {
			"command": "npx",
			"args": ["krometrail@latest", "--mcp"],
			"env": {}
		}
	}
}
```

## OpenAI Codex

Add to `~/.codex/config.toml` (global) or `.codex/config.toml` in your project:

```toml
[mcp_servers.krometrail]
command = "npx"
args = ["krometrail@latest", "--mcp"]
```

Or add via the CLI:

```bash
codex mcp add krometrail -- npx krometrail@latest --mcp
```

Codex also supports the CLI path — install the krometrail skill:

```bash
npx skills add nklisch/krometrail --skill krometrail-debug krometrail-chrome
```

## Tool Filtering

Expose only the tool groups you need, reducing the agent's tool list:

### Claude Code

```bash
# Debug tools only
claude mcp add --transport stdio --scope project krometrail-debug -- npx krometrail@latest --mcp --tools debug

# Browser tools only
claude mcp add --transport stdio --scope project krometrail-browser -- npx krometrail@latest --mcp --tools browser
```

### Cursor / Windsurf / manual `.mcp.json`

```json
{
	"mcpServers": {
		"krometrail-debug": {
			"command": "npx",
			"args": ["krometrail@latest", "--mcp", "--tools", "debug"]
		},
		"krometrail-browser": {
			"command": "npx",
			"args": ["krometrail@latest", "--mcp", "--tools", "browser"]
		}
	}
}
```

### OpenAI Codex

```bash
# Debug tools only
codex mcp add krometrail-debug -- npx krometrail@latest --mcp --tools debug

# Browser tools only
codex mcp add krometrail-browser -- npx krometrail@latest --mcp --tools browser
```

Available tool groups: `debug`, `browser`, `session`, `all` (default).

## Verification

Ask your agent: "What debug tools do you have available?" It should list `debug_launch`, `debug_continue`, `debug_evaluate`, and other tools.

Run `krometrail doctor` in a terminal to confirm which language adapters are installed.

## Auto-Updates

Krometrail checks for updates on every MCP server startup and updates itself
automatically. Updates take effect the next time the server starts.

- **Binary installs** download the latest release from GitHub
- **npx/bunx** uses the `@latest` tag (no download needed)
- **Global npm/bun** runs the package manager's update command

To disable auto-updates, set the environment variable in your MCP config:

```json
{
  "mcpServers": {
    "krometrail": {
      "command": "krometrail",
      "args": ["--mcp"],
      "env": {
        "KROMETRAIL_NO_UPDATE": "1"
      }
    }
  }
}
```
