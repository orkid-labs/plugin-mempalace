/**
 * RECALL_PALACE_MEMORY — search MemPalace for relevant memories.
 *
 * Thin wrapper that forwards to mempalace_search. All search parameters
 * (query, wing, room, limit, since, before, source_file, max_distance)
 * are passed through dynamically — no hardcoded field extraction.
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

export const recallMemoryAction: Action = {
  name: "RECALL_PALACE_MEMORY",
  similes: [
    "SEARCH_MEMORY",
    "RECALL_MEMORY",
    "PALACE_SEARCH",
    "REMEMBER",
    "LOOK_UP",
  ],
  description:
    "Search MemPalace persistent memory for relevant information from this or previous sessions. " +
    "Pass-through to mempalace_search — accepts query, wing, room, limit, since, before, source_file, max_distance.",

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

      const opts = (options as Record<string, unknown>) || {};
      const args: Record<string, unknown> = { ...opts };
      if (!args.query) {
        args.query = message.content.text || "";
      }
      if (!args.limit) {
        args.limit = 5;
      }

      if (!args.query) {
        const text = "I need a search query to recall memories.";
        if (callback) await callback({ text, actions: ["RECALL_PALACE_MEMORY"] });
        return { success: false, text };
      }

      logger.info(`MemPalace search: query="${String(args.query).slice(0, 80)}"`);
      const result = await service.callTool("mempalace_search", args);

      const text = `MemPalace search completed.`;
      if (callback) await callback({ text, actions: ["RECALL_PALACE_MEMORY"], data: result as any });
      return { success: true, text, data: result as any };
    } catch (error) {
      const text = `Memory recall error: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text, actions: ["RECALL_PALACE_MEMORY"] });
      return { success: false, text };
    }
  },

  examples: [
    [
      {
        name: "{{userName}}",
        content: { text: "what do you remember about the deploy config?", actions: [] },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "MemPalace search completed.",
          actions: ["RECALL_PALACE_MEMORY"],
        },
      },
    ],
  ],
};
