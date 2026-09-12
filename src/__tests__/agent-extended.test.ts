/**
 * Extended agent integration tests — round-trip workflows, provider,
 * stdio transport, error handling, and broader tool coverage.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestRuntime, cleanupTestRuntime, createTestMemory, createTestState } from "./test-utils";
import { memPalacePlugin } from "../index";
import { MemPalaceService } from "../service";
import type { IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core";
import { vi } from "vitest";

let runtime: IAgentRuntime;

beforeAll(async () => {
  process.env.MEMPALACE_MCP_URL = "http://127.0.0.1:8766/mcp";
  runtime = await createTestRuntime({
    character: { name: "Memory Test Agent" },
    plugins: [memPalacePlugin],
  });
}, 30000);

afterAll(async () => {
  await cleanupTestRuntime(runtime);
});

function makeCallback(): { callback: HandlerCallback; calls: any[] } {
  const calls: any[] = [];
  const callback = vi.fn(async (response: any) => {
    calls.push(response);
    return [];
  }) as any as HandlerCallback;
  return { callback, calls };
}

function makeMessage(text: string): Memory {
  return createTestMemory({ content: { text } as any });
}

function makeState(): State {
  return createTestState();
}

// --- Round-trip tests ---

describe("round-trip: store then recall", () => {
  it("should store a unique memory and recall it", async () => {
    const storeAction = runtime.actions.find((a) => a.name === "STORE_PALACE_MEMORY")!;
    const recallAction = runtime.actions.find((a) => a.name === "RECALL_PALACE_MEMORY")!;
    const uniqueContent = "round-trip-test-" + Date.now() + " the agent likes rust over python";

    // Store
    const { callback: storeCb } = makeCallback();
    const storeResult: any = await storeAction.handler(
      runtime, makeMessage(uniqueContent), makeState(),
      { wing: "wing_devin", room: "round-trip-test", content: uniqueContent } as any,
      storeCb
    );
    expect(storeResult.success).toBe(true);

    // Wait a moment for indexing
    await new Promise(r => setTimeout(r, 500));

    // Recall
    const { callback: recallCb, calls: recallCalls } = makeCallback();
    const recallResult: any = await recallAction.handler(
      runtime, makeMessage("what does the agent like?"), makeState(),
      { query: "agent likes rust", limit: 5 } as any,
      recallCb
    );
    expect(recallResult.success).toBe(true);
    expect(recallCalls[0].data).toBeDefined();
  }, 20000);
});

describe("round-trip: KG add, query, supersede, query again", () => {
  const subject = "elizaos-rt-test-" + Date.now();
  const predicate = "uses_transport";
  const oldObject = "http";
  const newObject = "stdio";

  it("should add a fact, query it, supersede, and query the new value", async () => {
    const action = runtime.actions.find((a) => a.name === "CALL_MEMPALACE_TOOL")!;

    // Add
    const { callback: addCb } = makeCallback();
    const addResult: any = await action.handler(
      runtime, makeMessage(""), makeState(),
      { tool: "mempalace_kg_add", args: { subject, predicate, object: oldObject } } as any,
      addCb
    );
    expect(addResult.success).toBe(true);

    // Query — should see old value
    const { callback: q1Cb, calls: q1Calls } = makeCallback();
    await action.handler(
      runtime, makeMessage(""), makeState(),
      { tool: "mempalace_kg_query", args: { entity: subject } } as any,
      q1Cb
    );
    const facts1 = q1Calls[0]?.data?.facts || [];
    const hasOld = facts1.some((f: any) => f.object === oldObject && f.current);
    expect(hasOld).toBe(true);

    // Supersede
    const { callback: supCb } = makeCallback();
    const supResult: any = await action.handler(
      runtime, makeMessage(""), makeState(),
      { tool: "mempalace_kg_supersede", args: { subject, predicate, old_object: oldObject, new_object: newObject } } as any,
      supCb
    );
    expect(supResult.success).toBe(true);

    // Query — should see new value, not old
    const { callback: q2Cb, calls: q2Calls } = makeCallback();
    await action.handler(
      runtime, makeMessage(""), makeState(),
      { tool: "mempalace_kg_query", args: { entity: subject } } as any,
      q2Cb
    );
    const facts2 = q2Calls[0]?.data?.facts || [];
    const hasNew = facts2.some((f: any) => f.object === newObject && f.current);
    const hasOldCurrent = facts2.some((f: any) => f.object === oldObject && f.current);
    expect(hasNew).toBe(true);
    expect(hasOldCurrent).toBe(false);
  }, 30000);
});

describe("round-trip: diary write then read", () => {
  it("should write a diary entry and read it back", async () => {
    const action = runtime.actions.find((a) => a.name === "CALL_MEMPALACE_TOOL")!;
    const agentName = "elizaos-rt-test-" + Date.now();
    const entry = "round-trip diary test entry at " + new Date().toISOString();

    // Write
    const { callback: writeCb } = makeCallback();
    const writeResult: any = await action.handler(
      runtime, makeMessage(""), makeState(),
      { tool: "mempalace_diary_write", args: { agent_name: agentName, content: entry } } as any,
      writeCb
    );
    expect(writeResult.success).toBe(true);

    // Read
    const { callback: readCb, calls: readCalls } = makeCallback();
    const readResult: any = await action.handler(
      runtime, makeMessage(""), makeState(),
      { tool: "mempalace_diary_read", args: { agent_name: agentName, last_n: 5 } } as any,
      readCb
    );
    expect(readResult.success).toBe(true);
    expect(readCalls[0].data).toBeDefined();
    // The diary entries should be in the response
    const data = readCalls[0].data;
    const entries = data?.entries || data?.diary_entries || [];
    expect(entries.length).toBeGreaterThanOrEqual(1);
  }, 20000);
});

// --- Provider test ---

describe("MEMPALACE_CONTEXT provider", () => {
  it("should return context from live MemPalace", async () => {
    const provider = runtime.providers.find((p) => p.name === "MEMPALACE_CONTEXT")!;
    const message = makeMessage("tell me about the test agent");
    const state = makeState();

    const result = await provider.get(runtime, message, state);
    expect(result.text).toBeDefined();
    expect(result.values).toBeDefined();
    expect((result.values as any).mempalaceAvailable).toBe(true);
    expect(result.data).toBeDefined();
  }, 15000);

  it("should skip for very short messages", async () => {
    const provider = runtime.providers.find((p) => p.name === "MEMPALACE_CONTEXT")!;
    const message = makeMessage("hi");
    const state = makeState();

    const result = await provider.get(runtime, message, state);
    expect((result.values as any).mempalaceAvailable).toBe(true);
    expect(result.text).toBe("");
  }, 10000);
});

// --- Broader tool coverage through CALL_MEMPALACE_TOOL ---

describe("CALL_MEMPALACE_TOOL — broader tool coverage", () => {
  function getAction() {
    return runtime.actions.find((a) => a.name === "CALL_MEMPALACE_TOOL")!;
  }

  it("should call mempalace_get_taxonomy", async () => {
    const { callback, calls } = makeCallback();
    const result: any = await getAction().handler(
      runtime, makeMessage(""), makeState(),
      { tool: "mempalace_get_taxonomy", args: {} } as any, callback
    );
    expect(result.success).toBe(true);
    expect(calls[0].data).toBeDefined();
  }, 15000);

  it("should call mempalace_kg_stats", async () => {
    const { callback, calls } = makeCallback();
    const result: any = await getAction().handler(
      runtime, makeMessage(""), makeState(),
      { tool: "mempalace_kg_stats", args: {} } as any, callback
    );
    expect(result.success).toBe(true);
    expect(calls[0].data).toBeDefined();
  }, 15000);

  it("should call mempalace_graph_stats", async () => {
    const { callback, calls } = makeCallback();
    const result: any = await getAction().handler(
      runtime, makeMessage(""), makeState(),
      { tool: "mempalace_graph_stats", args: {} } as any, callback
    );
    expect(result.success).toBe(true);
    expect(calls[0].data).toBeDefined();
  }, 15000);

  it("should call mempalace_list_rooms with wing filter", async () => {
    const { callback, calls } = makeCallback();
    const result: any = await getAction().handler(
      runtime, makeMessage(""), makeState(),
      { tool: "mempalace_list_rooms", args: { wing: "orkid" } } as any, callback
    );
    expect(result.success).toBe(true);
    expect(calls[0].data).toBeDefined();
  }, 15000);

  it("should call mempalace_kg_timeline", async () => {
    const { callback, calls } = makeCallback();
    const result: any = await getAction().handler(
      runtime, makeMessage(""), makeState(),
      { tool: "mempalace_kg_timeline", args: { entity: "mempalace" } } as any, callback
    );
    expect(result.success).toBe(true);
    expect(calls[0].data).toBeDefined();
  }, 15000);

  it("should call mempalace_traverse", async () => {
    const { callback, calls } = makeCallback();
    const result: any = await getAction().handler(
      runtime, makeMessage(""), makeState(),
      { tool: "mempalace_traverse", args: { start_room: "diary", max_hops: 1 } } as any, callback
    );
    expect(result.success).toBe(true);
    expect(calls[0].data).toBeDefined();
  }, 15000);

  it("should call mempalace_find_tunnels", async () => {
    const { callback, calls } = makeCallback();
    const result: any = await getAction().handler(
      runtime, makeMessage(""), makeState(),
      { tool: "mempalace_find_tunnels", args: { wing_a: "orkid", wing_b: "defi" } } as any, callback
    );
    expect(result.success).toBe(true);
    expect(calls[0].data).toBeDefined();
  }, 15000);

  it("should call mempalace_check_duplicate", async () => {
    const { callback, calls } = makeCallback();
    const result: any = await getAction().handler(
      runtime, makeMessage(""), makeState(),
      { tool: "mempalace_check_duplicate", args: { content: "duplicate check test from agent" } } as any, callback
    );
    expect(result.success).toBe(true);
    expect(calls[0].data).toBeDefined();
  }, 15000);

  it("should call mempalace_list_drawers with pagination", async () => {
    const { callback, calls } = makeCallback();
    const result: any = await getAction().handler(
      runtime, makeMessage(""), makeState(),
      { tool: "mempalace_list_drawers", args: { wing: "wing_devin", limit: 2, offset: 0 } } as any, callback
    );
    expect(result.success).toBe(true);
    expect(calls[0].data).toBeDefined();
  }, 15000);

  it("should call mempalace_get_aaak_spec", async () => {
    const { callback, calls } = makeCallback();
    const result: any = await getAction().handler(
      runtime, makeMessage(""), makeState(),
      { tool: "mempalace_get_aaak_spec", args: {} } as any, callback
    );
    expect(result.success).toBe(true);
    expect(calls[0].data).toBeDefined();
  }, 15000);

  it("should call mempalace_mesh_peers", async () => {
    const { callback, calls } = makeCallback();
    const result: any = await getAction().handler(
      runtime, makeMessage(""), makeState(),
      { tool: "mempalace_mesh_peers", args: {} } as any, callback
    );
    expect(result.success).toBe(true);
    expect(calls[0].data).toBeDefined();
  }, 15000);

  it("should call mempalace_hook_settings", async () => {
    const { callback, calls } = makeCallback();
    const result: any = await getAction().handler(
      runtime, makeMessage(""), makeState(),
      { tool: "mempalace_hook_settings", args: {} } as any, callback
    );
    expect(result.success).toBe(true);
    expect(calls[0].data).toBeDefined();
  }, 15000);
});

// --- Error handling ---

describe("error handling", () => {
  it("CALL_MEMPALACE_TOOL should fail without tool name", async () => {
    const action = runtime.actions.find((a) => a.name === "CALL_MEMPALACE_TOOL")!;
    const { callback } = makeCallback();
    const result: any = await action.handler(
      runtime, makeMessage(""), makeState(),
      { args: {} } as any, callback
    );
    expect(result.success).toBe(false);
    expect(result.text).toContain("tool name");
  }, 10000);

  it("CALL_MEMPALACE_TOOL should fail with empty tool name", async () => {
    const action = runtime.actions.find((a) => a.name === "CALL_MEMPALACE_TOOL")!;
    const { callback } = makeCallback();
    const result: any = await action.handler(
      runtime, makeMessage(""), makeState(),
      { tool: "", args: {} } as any, callback
    );
    expect(result.success).toBe(false);
    expect(result.text).toContain("tool name");
  }, 10000);

  it("should fail when service not configured", async () => {
    // Temporarily clear env vars so the bare service has no config source
    const oldUrl = process.env.MEMPALACE_MCP_URL;
    const oldCmd = process.env.MEMPALACE_MCP_CMD;
    delete process.env.MEMPALACE_MCP_URL;
    delete process.env.MEMPALACE_MCP_CMD;

    const bareRuntime = {
      getSetting: () => null,
      getService: () => undefined,
    } as unknown as IAgentRuntime;
    const bareService = await MemPalaceService.start(bareRuntime);

    expect(bareService.isAvailable()).toBe(false);

    const action = runtime.actions.find((a) => a.name === "STORE_PALACE_MEMORY")!;
    const { callback } = makeCallback();
    const result: any = await action.handler(
      bareRuntime, makeMessage("test"), makeState(),
      { content: "test" } as any, callback
    );
    expect(result.success).toBe(false);
    expect(result.text).toContain("not configured");

    await bareService.stop();

    // Restore env vars
    if (oldUrl) process.env.MEMPALACE_MCP_URL = oldUrl;
    if (oldCmd) process.env.MEMPALACE_MCP_CMD = oldCmd;
  }, 15000);
});

// --- Action metadata ---

describe("action metadata", () => {
  it("all actions should have similes", () => {
    for (const action of runtime.actions) {
      expect(action.similes).toBeDefined();
      expect(Array.isArray(action.similes)).toBe(true);
      expect((action.similes as string[]).length).toBeGreaterThan(0);
    }
  });

  it("all actions should have examples defined", () => {
    for (const action of runtime.actions) {
      expect(action.examples).toBeDefined();
      expect(Array.isArray(action.examples)).toBe(true);
    }
  });

  it("all actions should have descriptions", () => {
    for (const action of runtime.actions) {
      expect(action.description).toBeDefined();
      expect(action.description.length).toBeGreaterThan(20);
    }
  });

  it("CALL_MEMPALACE_TOOL description should list available tools", () => {
    const action = runtime.actions.find((a) => a.name === "CALL_MEMPALACE_TOOL")!;
    expect(action.description).toContain("mempalace_status");
    expect(action.description).toContain("mempalace_kg_query");
    expect(action.description).toContain("mempalace_diary_write");
  });
});

// --- Stdio transport test ---

describe("stdio transport integration", () => {
  it("should connect via stdio and call tools", async () => {
    const stdioRuntime = await createTestRuntime({
      character: { name: "Stdio Test Agent" },
      plugins: [memPalacePlugin],
    });

    // Override the service to use stdio
    const svc = stdioRuntime.getService<MemPalaceService>("mempalace");
    expect(svc).toBeDefined();

    // Manually configure for stdio
    (svc as any).mcpUrl = null;
    (svc as any).mcpCmd = "mempalace-mcp";
    (svc as any).transport = "stdio";

    expect(svc!.isAvailable()).toBe(true);

    // Call status via stdio
    const result = await svc!.callTool("mempalace_status", {});
    expect(result).toBeDefined();
    expect((result as any).total_drawers).toBeDefined();

    await svc!.stop();
    await cleanupTestRuntime(stdioRuntime);
  }, 30000);
});

// --- Plugin lifecycle ---

describe("plugin lifecycle", () => {
  it("should init with valid config", async () => {
    await (memPalacePlugin.init as any)({
      MEMPALACE_MCP_URL: "http://127.0.0.1:8766/mcp",
    });
    expect(process.env.MEMPALACE_MCP_URL).toBe("http://127.0.0.1:8766/mcp");
  }, 10000);

  it("should reject invalid config", async () => {
    await expect(
      (memPalacePlugin.init as any)({ MEMPALACE_MCP_URL: 123 as any })
    ).rejects.toThrow();
  }, 10000);
});
