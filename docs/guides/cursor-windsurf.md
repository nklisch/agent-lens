# Using Agent Lens with Cursor and Windsurf

Both Cursor and Windsurf support MCP servers. Agent Lens integrates via MCP to give the AI runtime debugging.

## Cursor Setup

Add to your Cursor MCP configuration at `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "agent-lens": {
      "command": "npx",
      "args": ["agent-lens", "mcp"]
    }
  }
}
```

Or with a compiled binary:

```json
{
  "mcpServers": {
    "agent-lens": {
      "command": "/usr/local/bin/agent-lens",
      "args": ["mcp"]
    }
  }
}
```

Restart Cursor after saving the config. The `debug_*` tools will appear in the AI's tool list.

## Windsurf Setup

Add to your Windsurf MCP configuration at `~/.windsurf/mcp_config.json` (or via the Windsurf settings UI):

```json
{
  "mcpServers": {
    "agent-lens": {
      "command": "npx",
      "args": ["agent-lens", "mcp"],
      "env": {}
    }
  }
}
```

## Verification

Ask the AI assistant:

> What debugging tools do you have access to?

It should mention `debug_launch`, `debug_continue`, `debug_evaluate`, and other `debug_*` tools.

Run a quick test:

> Launch a debug session for this Python file and show me the variables at line 10.

## Project-Level Configuration

For team setups, add a `.mcp.json` file to your project root:

```json
{
  "mcpServers": {
    "agent-lens": {
      "command": "npx",
      "args": ["agent-lens", "mcp"]
    }
  }
}
```

This lets all team members use agent-lens without individual configuration.

## Known Limitations

- **MCP transport**: Agent Lens uses stdio transport, which is supported by both Cursor and Windsurf.
- **Session persistence**: Debug sessions persist as long as the MCP server process runs. If Cursor/Windsurf restarts the MCP server, active sessions are lost.
- **Port allocation**: Agent Lens allocates local ports for debugger connections. Ensure ports 4000–5000 are not blocked by firewall rules.

## Checking Adapter Status

In a terminal:

```bash
agent-lens doctor
```

This confirms which language debuggers are installed (Python, Node.js, Go, Rust, Java, C/C++).
