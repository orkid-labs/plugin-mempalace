/**
 * plugin-mempalace — ElizaOS plugin for persistent agent memory via MemPalace MCP.
 *
 * Actions:
 *   STORE_PALACE_MEMORY     — store content in MemPalace (mempalace_add_drawer)
 *   RECALL_PALACE_MEMORY    — search MemPalace (mempalace_search)
 *   CALL_MEMPALACE_TOOL     — generic passthrough to any MemPalace MCP tool
 *
 * Provider:
 *   MEMPALACE_CONTEXT       — injects relevant memories into agent context
 *
 * Service:
 *   MemPalaceService        — manages MCP client (stdio or HTTP/SSE transport)
 *
 * Configuration:
 *   MEMPALACE_MCP_CMD       — command to spawn MemPalace MCP server (stdio mode)
 *   MEMPALACE_MCP_URL       — URL of running MemPalace server (HTTP mode)
 *   MEMPALACE_DIR           — data directory for MemPalace (optional)
 *
 * If both MEMPALACE_MCP_URL and MEMPALACE_MCP_CMD are set, HTTP takes precedence.
 */

import type { Plugin } from "@elizaos/core";
import { logger } from "@elizaos/core";
import { z } from "zod";
import { MemPalaceService } from "./service";
import { storeMemoryAction } from "./actions/storeMemory";
import { recallMemoryAction } from "./actions/recallMemory";
import { callMempalaceToolAction } from "./actions/callMempalaceTool";
import { memPalaceProvider } from "./providers/memory";
import { MemPalacePluginTestSuite } from "./e2e/plugin-mempalace.e2e";

const configSchema = z.object({
  MEMPALACE_MCP_CMD: z
    .string()
    .optional()
    .describe("Command to spawn MemPalace MCP server (stdio transport)."),
  MEMPALACE_MCP_URL: z
    .string()
    .optional()
    .describe("URL of running MemPalace HTTP/SSE server (HTTP transport)."),
  MEMPALACE_DIR: z
    .string()
    .optional()
    .describe("Data directory for MemPalace storage (optional)."),
});

export const memPalacePlugin: Plugin = {
  name: "plugin-mempalace",
  description:
    "Persistent agent memory via MemPalace MCP — store, search, and recall context across sessions. " +
    "Generic tool passthrough supports all 36+ MemPalace MCP tools. Supports stdio and HTTP/SSE transports.",
  config: {
    MEMPALACE_MCP_CMD: process.env.MEMPALACE_MCP_CMD ?? null,
    MEMPALACE_MCP_URL: process.env.MEMPALACE_MCP_URL ?? null,
    MEMPALACE_DIR: process.env.MEMPALACE_DIR ?? null,
  },

  async init(config: Record<string, string>) {
    logger.debug("plugin-mempalace initializing");
    try {
      const validatedConfig = await configSchema.parseAsync(config);
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value) process.env[key] = String(value);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const msgs = error.issues?.map((e) => e.message).join(", ") || "unknown";
        throw new Error(`Invalid plugin-mempalace configuration: ${msgs}`);
      }
      throw new Error(
        `Invalid plugin-mempalace configuration: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },

  actions: [storeMemoryAction, recallMemoryAction, callMempalaceToolAction],
  providers: [memPalaceProvider],
  services: [MemPalaceService],
  tests: [MemPalacePluginTestSuite],

  async dispose(runtime) {
    await runtime.getService<MemPalaceService>(MemPalaceService.serviceType)?.stop();
  },
};

export default memPalacePlugin;
