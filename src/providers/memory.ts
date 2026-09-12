/**
 * memPalaceProvider — gives the agent context from MemPalace memory.
 *
 * On each interaction, searches MemPalace for relevant context based on
 * the current message text. Returns raw results — no hardcoded field
 * extraction. The agent interprets the response structure.
 */

import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import { logger } from "@elizaos/core";
import { MemPalaceService } from "../service";

export const memPalaceProvider: Provider = {
  name: "MEMPALACE_CONTEXT",
  description:
    "Provides relevant context from MemPalace persistent memory based on the current conversation.",

  get: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<ProviderResult> => {
    try {
      const service = runtime.getService<MemPalaceService>(MemPalaceService.serviceType);
      if (!service || !service.isAvailable()) {
        return {
          text: "",
          values: { mempalaceAvailable: false },
          data: {},
        };
      }

      const query = message.content.text || "";
      if (!query || query.length < 3) {
        return {
          text: "",
          values: { mempalaceAvailable: true },
          data: {},
        };
      }

      const result = await service.callTool("mempalace_search", {
        query,
        limit: 3,
      });

      return {
        text: `MemPalace context search completed.`,
        values: {
          mempalaceAvailable: true,
        },
        data: { mempalaceResult: result } as any,
      };
    } catch (error) {
      logger.debug(`MemPalace provider error: ${error instanceof Error ? error.message : String(error)}`);
      return {
        text: "",
        values: { mempalaceAvailable: false },
        data: {},
      };
    }
  },
};
