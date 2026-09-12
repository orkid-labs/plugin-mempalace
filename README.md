# @orkid-labs/plugin-mempalace

ElizaOS plugin for persistent agent memory via MemPalace MCP. Store, search, and recall context across sessions. Supports stdio and HTTP/SSE transports.

## Installation

```bash
elizaos plugins add @orkid-labs/plugin-mempalace
```

Or with bun:

```bash
bun add @orkid-labs/plugin-mempalace
```

## Configuration

Add one of the following to your `.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `MEMPALACE_MCP_CMD` | One of | Command to spawn MemPalace MCP server (stdio transport). Example: `mempalace-mcp` |
| `MEMPALACE_MCP_URL` | One of | URL of running MemPalace HTTP/SSE server. Takes precedence over `MEMPALACE_MCP_CMD`. |
| `MEMPALACE_DIR` | No | Data directory for MemPalace storage. |

If both `MEMPALACE_MCP_URL` and `MEMPALACE_MCP_CMD` are set, HTTP transport takes precedence.

## Actions

| Action | Description |
|--------|-------------|
| `STORE_PALACE_MEMORY` | Store content in MemPalace for later recall. Specify `wing`, `room`, and `content`. |
| `RECALL_PALACE_MEMORY` | Semantic search of MemPalace memories. Returns matching content with wing/room location. |

## Provider

**`MEMPALACE_CONTEXT`** — Automatically searches MemPalace for relevant context based on the current conversation and injects it into the agent's context window.

## Service

**`MemPalaceService`** — Manages the MCP client lifecycle. Supports two transport modes:

1. **stdio** — Spawns the MemPalace MCP server as a subprocess. Uses JSON-RPC over stdin/stdout.
2. **HTTP/SSE** — Connects to a running MemPalace HTTP server. Uses JSON-RPC over HTTP POST.

## Usage Examples

### Store a Memory

```
User: remember that the staging agent runs on the Dell at port 2138
Agent: Stored in MemPalace (wing: infra, room: agent-hosts).
```

### Recall a Memory

```
User: where does the staging agent run?
Agent: Recalled 1 memory:
  1. [infra/agent-hosts] The staging agent runs on the Dell at port 2138
```

## Security

- **Never store secrets, credentials, or API keys in MemPalace.**
- The plugin does not log or expose MemPalace content beyond the agent's response.
- MemPalace data is stored locally (stdio mode) or on the configured server (HTTP mode).

## License

MIT
