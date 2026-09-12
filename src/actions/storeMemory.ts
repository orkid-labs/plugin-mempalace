/**
 * STORE_PALACE_MEMORY — store content in MemPalace for later recall.
 *
 * Thin wrapper that forwards to mempalace_add_drawer. All parameters
 * (wing, room, content, source_file, added_by) are passed through
 * dynamically. No secrets or credentials should be stored.
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

export const storeMemoryAction: Action = {
  name: "STORE_PALACE_MEMORY",
  similes: [
    "REMEMBER_THIS",
    "SAVE_MEMORY",
    "STORE_MEMORY",
    "PALACE_STORE",
    "MEMORIZE",
  ],
  description:
    "Store a piece of information in MemPalace persistent memory for later recall across sessions. " +
    "Pass-through to mempalace_add_drawer — accepts wing, room, content, source_file, added_by.",

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
      if (!args.wing) args.wing = "elizaos";
      if (!args.room) args.room = "agent-memory";
      if (!args.content) args.content = message.content.text || "";
      if (!args.added_by) args.added_by = "elizaos";

      if (!args.content) {
        const text = "I need content to store in memory.";
        if (callback) await callback({ text, actions: ["STORE_PALACE_MEMORY"] });
        return { success: false, text };
      }

      logger.info(`MemPalace store: wing=${args.wing} room=${args.room} content=${String(args.content).length} chars`);
      const result = await service.callTool("mempalace_add_drawer", args);

      const text = `Stored in MemPalace (wing: ${args.wing}, room: ${args.room}).`;
      if (callback) await callback({ text, actions: ["STORE_PALACE_MEMORY"], data: result as any });
      return { success: true, text, data: result as any };
    } catch (error) {
      const text = `Memory store error: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text, actions: ["STORE_PALACE_MEMORY"] });
      return { success: false, text };
    }
  },

  examples: [
    [
      {
        name: "{{userName}}",
        content: { text: "remember that the deploy key is in the vault", actions: [] },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "Stored in MemPalace (wing: elizaos, room: agent-memory).",
          actions: ["STORE_PALACE_MEMORY"],
        },
      },
    ],
  ],
};
