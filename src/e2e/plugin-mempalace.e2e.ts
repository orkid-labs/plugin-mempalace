/**
 * plugin-mempalace E2E TestSuite — verifies action, provider, and service
 * registrations for the MemPalace memory plugin.
 */

import type { IAgentRuntime, TestSuite } from "@elizaos/core";

export const MemPalacePluginTestSuite: TestSuite = {
  name: "plugin_mempalace_test_suite",
  tests: [
    {
      name: "should_have_mempalace_service",
      fn: async (runtime: IAgentRuntime) => {
        const service = runtime.getService("mempalace");
        if (!service) {
          throw new Error("MemPalaceService not found in runtime");
        }
      },
    },

    {
      name: "should_have_store_memory_action",
      fn: async (runtime: IAgentRuntime) => {
        const action = runtime.actions.find((a) => a.name === "STORE_PALACE_MEMORY");
        if (!action) {
          throw new Error("STORE_PALACE_MEMORY action not found");
        }
      },
    },

    {
      name: "should_have_recall_memory_action",
      fn: async (runtime: IAgentRuntime) => {
        const action = runtime.actions.find((a) => a.name === "RECALL_PALACE_MEMORY");
        if (!action) {
          throw new Error("RECALL_PALACE_MEMORY action not found");
        }
      },
    },

    {
      name: "should_have_call_mempalace_tool_action",
      fn: async (runtime: IAgentRuntime) => {
        const action = runtime.actions.find((a) => a.name === "CALL_MEMPALACE_TOOL");
        if (!action) {
          throw new Error("CALL_MEMPALACE_TOOL action not found");
        }
      },
    },

    {
      name: "should_have_context_provider",
      fn: async (runtime: IAgentRuntime) => {
        const provider = runtime.providers.find(
          (p) => p.name === "MEMPALACE_CONTEXT"
        );
        if (!provider) {
          throw new Error("MEMPALACE_CONTEXT provider not found");
        }
      },
    },
  ],
};

export default MemPalacePluginTestSuite;
