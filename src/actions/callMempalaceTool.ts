/**
 * CALL_MEMPALACE_TOOL — generic passthrough to any MemPalace MCP tool.
 *
 * Instead of hardcoding every MemPalace tool as a separate action, this
 * single action forwards the tool name and arguments directly to the
 * MemPalace MCP server. The agent picks the tool and passes arguments
 * dynamically — no plugin changes needed when MemPalace adds new tools.
 *
 * Options:
 *   tool — the MCP tool name (e.g. "mempalace_status", "mempalace_kg_query")
 *   args — object of arguments to pass to the tool
 */

import type {
  Action,
  ActionResult,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import { logger } from "@elizaos/core";
import { MemPalaceService } from "../service";

interface CallToolOptions {
  tool?: string;
  args?: Record<string, unknown>;
}

export const callMempalaceToolAction: Action = {
  name: "CALL_MEMPALACE_TOOL",
  similes: [
    "MEMPALACE",
    "PALACE_TOOL",
    "MCP_CALL",
    "USE_MEMPALACE",
  ],
  description:
    "Call any MemPalace MCP tool by name with arbitrary arguments. " +
    "Available tools include: mempalace_status, mempalace_search, " +
    "mempalace_add_drawer, mempalace_kg_query, mempalace_kg_add, " +
    "mempalace_kg_supersede, mempalace_kg_invalidate, mempalace_kg_timeline, " +
    "mempalace_kg_stats, mempalace_diary_write, mempalace_diary_read, " +
    "mempalace_check_duplicate, mempalace_checkpoint, mempalace_list_wings, " +
    "mempalace_list_rooms, mempalace_get_taxonomy, mempalace_get_drawer, " +
    "mempalace_list_drawers, mempalace_update_drawer, mempalace_delete_drawer, " +
    "mempalace_create_tunnel, mempalace_list_tunnels, mempalace_delete_tunnel, " +
    "mempalace_traverse, mempalace_find_tunnels, mempalace_follow_tunnels, " +
    "mempalace_list_hallways, mempalace_graph_stats, mempalace_mesh_peers, " +
    "mempalace_mine, mempalace_sync, mempalace_get_aaak_spec, " +
    "mempalace_hook_settings, mempalace_delete_by_source.",

  validate: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    const service = runtime.getService<MemPalaceService>(MemPalaceService.serviceType);
    return !!service?.isAvailable();
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    options: HandlerOptions | undefined,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      const service = runtime.getService<MemPalaceService>(MemPalaceService.serviceType);
      if (!service || !service.isAvailable()) {
        return { success: false, text: "MemPalace not configured." };
      }

      const opts = (options as CallToolOptions) || {};
      const tool = opts.tool || "";
      const args = opts.args || {};

      if (!tool) {
        const text = "I need a tool name to call MemPalace.";
        if (callback) await callback({ text, actions: ["CALL_MEMPALACE_TOOL"] });
        return { success: false, text };
      }

      logger.info(`MemPalace tool call: ${tool} args=${Object.keys(args).join(",") || "(none)"}`);
      const result = await service.callTool(tool, args);

      const text = `MemPalace ${tool} completed.`;
      if (callback) await callback({ text, actions: ["CALL_MEMPALACE_TOOL"], data: result as any });
      return { success: true, text, data: result as any };
    } catch (error) {
      const text = `MemPalace tool error: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text, actions: ["CALL_MEMPALACE_TOOL"] });
      return { success: false, text };
    }
  },

  examples: [
    [
      {
        name: "{{userName}}",
        content: { text: "check your memory status", actions: [] },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "MemPalace mempalace_status completed.",
          actions: ["CALL_MEMPALACE_TOOL"],
        },
      },
    ],
    [
      {
        name: "{{userName}}",
        content: { text: "what do you know about the deploy config?", actions: [] },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "MemPalace mempalace_search completed.",
          actions: ["CALL_MEMPALACE_TOOL"],
        },
      },
    ],
  ],
};
