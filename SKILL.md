---
name: plugin-mempalace
description: Give an ElizaOS agent persistent long-term memory via MemPalace — store, search, and recall context across sessions with verbatim recall. Use when building an agent that must remember users, preferences, prior conversations, or project state across restarts, over stdio or HTTP/SSE MCP transport.
license: MIT
metadata:
  author: orkid-labs
  version: "2.0.0"
  npm: "@orkid-labs/plugin-mempalace"
---

# MemPalace Plugin for ElizaOS

`@orkid-labs/plugin-mempalace` connects an ElizaOS agent to
[MemPalace](https://github.com/jjcav84/mempalace) — a local-first
persistent memory system with verbatim recall. Store, search, and recall
context across sessions; memory survives agent restarts.

## Install

```bash
elizaos plugins add @orkid-labs/plugin-mempalace
# or: bun add @orkid-labs/plugin-mempalace / npm install @orkid-labs/plugin-mempalace
```

## Configuration

One of these transport env vars is required:

| Variable | Required | Description |
|----------|----------|-------------|
| `MEMPALACE_MCP_CMD` | One of | Command to spawn the MemPalace MCP server (stdio). Example: `mempalace-mcp` |
| `MEMPALACE_MCP_URL` | One of | URL of a running MemPalace HTTP/SSE server. Takes precedence over `MEMPALACE_MCP_CMD`. |
| `MEMPALACE_DIR` | No | Data directory for MemPalace storage |

HTTP transport wins if both are set.

## What the agent gets

Persistent memory actions: store facts/preferences/project context,
search past interactions, recall verbatim what users said in earlier
sessions. MemPalace runs locally — memory data never leaves the host.

## Links

- npm: `@orkid-labs/plugin-mempalace`
- MemPalace: https://github.com/jjcav84/mempalace
- Site: https://orkidlabs.xyz
