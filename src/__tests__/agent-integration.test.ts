/**
 * Live agent integration test — boots a real ElizaOS AgentRuntime with
 * plugin-mempalace loaded, then exercises the actions against the live
 * MemPalace MCP server. No mocks on the MemPalace side.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestRuntime, cleanupTestRuntime, createTestMemory, createTestState } from "./test-utils";
import { memPalacePlugin } from "../index";
import type { IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core";
import { vi } from "vitest";

let runtime: IAgentRuntime;

beforeAll(async () => {
  // Point at the live MemPalace HTTP server
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

describe("agent integration — plugin-mempalace against live server", () => {
  it("should have MemPalaceService available", () => {
    const svc = runtime.getService("mempalace");
    expect(svc).toBeDefined();
    expect((svc as any).isAvailable()).toBe(true);
  });

  it("should have all 3 actions registered", () => {
    const names = runtime.actions.map((a) => a.name);
    expect(names).toContain("STORE_PALACE_MEMORY");
    expect(names).toContain("RECALL_PALACE_MEMORY");
    expect(names).toContain("CALL_MEMPALACE_TOOL");
  });

  it("STORE_PALACE_MEMORY should store a real memory", async () => {
    const action = runtime.actions.find((a) => a.name === "STORE_PALACE_MEMORY")!;
    const { callback, calls } = makeCallback();

    const result: any = await action.handler(
      runtime,
      makeMessage("remember that the test agent was initialized on 2026-09-10"),
      makeState(),
      { wing: "wing_devin", room: "agent-test", content: "test agent initialized 2026-09-10" } as any,
      callback
    );

    expect(result.success).toBe(true);
    expect(result.text).toContain("Stored in MemPalace");
    expect(calls.length).toBe(1);
    expect(calls[0].actions).toContain("STORE_PALACE_MEMORY");
  }, 15000);

  it("RECALL_PALACE_MEMORY should search and return results", async () => {
    const action = runtime.actions.find((a) => a.name === "RECALL_PALACE_MEMORY")!;
    const { callback, calls } = makeCallback();

    const result: any = await action.handler(
      runtime,
      makeMessage("what do you remember about the test agent?"),
      makeState(),
      { query: "test agent initialized", limit: 3 } as any,
      callback
    );

    expect(result.success).toBe(true);
    expect(result.text).toContain("search completed");
    expect(calls.length).toBe(1);
    expect(calls[0].data).toBeDefined();
  }, 15000);

  it("CALL_MEMPALACE_TOOL should call mempalace_status", async () => {
    const action = runtime.actions.find((a) => a.name === "CALL_MEMPALACE_TOOL")!;
    const { callback, calls } = makeCallback();

    const result: any = await action.handler(
      runtime,
      makeMessage("check your memory status"),
      makeState(),
      { tool: "mempalace_status", args: {} } as any,
      callback
    );

    expect(result.success).toBe(true);
    expect(result.text).toContain("mempalace_status completed");
    expect(calls[0].data).toBeDefined();
    // The unwrapped result should have total_drawers
    const data = calls[0].data;
    expect(data).toHaveProperty("total_drawers");
  }, 15000);

  it("CALL_MEMPALACE_TOOL should call mempalace_kg_query", async () => {
    const action = runtime.actions.find((a) => a.name === "CALL_MEMPALACE_TOOL")!;
    const { callback, calls } = makeCallback();

    const result: any = await action.handler(
      runtime,
      makeMessage("what do you know about mempalace?"),
      makeState(),
      { tool: "mempalace_kg_query", args: { entity: "mempalace" } } as any,
      callback
    );

    expect(result.success).toBe(true);
    expect(calls[0].data).toBeDefined();
    const data = calls[0].data;
    expect(data).toHaveProperty("facts");
    expect(Array.isArray(data.facts)).toBe(true);
  }, 15000);

  it("CALL_MEMPALACE_TOOL should call mempalace_diary_write", async () => {
    const action = runtime.actions.find((a) => a.name === "CALL_MEMPALACE_TOOL")!;
    const { callback, calls } = makeCallback();

    const result: any = await action.handler(
      runtime,
      makeMessage("write a diary entry about this test"),
      makeState(),
      { tool: "mempalace_diary_write", args: { agent_name: "elizaos-test-agent", content: "agent integration test completed" } } as any,
      callback
    );

    expect(result.success).toBe(true);
    expect(calls[0].data).toBeDefined();
    const data = calls[0].data;
    expect(data).toHaveProperty("success");
    expect(data.success).toBe(true);
  }, 15000);

  it("CALL_MEMPALACE_TOOL should call mempalace_list_wings", async () => {
    const action = runtime.actions.find((a) => a.name === "CALL_MEMPALACE_TOOL")!;
    const { callback, calls } = makeCallback();

    const result: any = await action.handler(
      runtime,
      makeMessage("show me your wings"),
      makeState(),
      { tool: "mempalace_list_wings", args: {} } as any,
      callback
    );

    expect(result.success).toBe(true);
    const data = calls[0].data;
    expect(data).toBeDefined();
  }, 15000);

  it("CALL_MEMPALACE_TOOL should handle unknown tool gracefully", async () => {
    const action = runtime.actions.find((a) => a.name === "CALL_MEMPALACE_TOOL")!;
    const { callback } = makeCallback();

    const result: any = await action.handler(
      runtime,
      makeMessage("call a nonexistent tool"),
      makeState(),
      { tool: "mempalace_nonexistent_tool", args: {} } as any,
      callback
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain("error");
  }, 15000);

  it("STORE_PALACE_MEMORY should fail without content", async () => {
    const action = runtime.actions.find((a) => a.name === "STORE_PALACE_MEMORY")!;
    const { callback } = makeCallback();

    const result: any = (await action.handler(
      runtime,
      makeMessage(""),
      makeState(),
      {} as any,
      callback
    ))!;

    expect(result!.success).toBe(false);
    expect(result!.text).toContain("need content");
  }, 15000);

  it("RECALL_PALACE_MEMORY should fail without query", async () => {
    const action = runtime.actions.find((a) => a.name === "RECALL_PALACE_MEMORY")!;
    const { callback } = makeCallback();

    const result: any = (await action.handler(
      runtime,
      makeMessage(""),
      makeState(),
      {} as any,
      callback
    ))!;

    expect(result!.success).toBe(false);
    expect(result!.text).toContain("search query");
  }, 15000);
});
