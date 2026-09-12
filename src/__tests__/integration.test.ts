/**
 * Component tests for plugin-mempalace — verifies plugin structure,
 * action validation, and service behavior with a mocked runtime.
 */

import type { IAgentRuntime } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { memPalacePlugin } from "../index";
import { MemPalaceService } from "../service";

async function createMockRuntime(configured: boolean): Promise<IAgentRuntime> {
  const services = new Map<string, unknown>();
  const runtime = {
    character: { name: "Eliza" } as any,
    actions: memPalacePlugin.actions ?? [],
    providers: memPalacePlugin.providers ?? [],
    getSetting: (key: string) => {
      if (key === "MEMPALACE_MCP_CMD") return configured ? "mempalace-server" : null;
      return null;
    },
    getService: <T>(name: string) => services.get(name) as T | undefined,
    _services: services,
  } as unknown as IAgentRuntime;

  // When unconfigured, temporarily clear env vars so the service doesn't
  // pick them up as a fallback (other test files may have set them).
  let savedUrl: string | undefined;
  let savedCmd: string | undefined;
  if (!configured) {
    savedUrl = process.env.MEMPALACE_MCP_URL;
    savedCmd = process.env.MEMPALACE_MCP_CMD;
    delete process.env.MEMPALACE_MCP_URL;
    delete process.env.MEMPALACE_MCP_CMD;
  }
  services.set("mempalace", await MemPalaceService.start(runtime));
  if (!configured) {
    if (savedUrl) process.env.MEMPALACE_MCP_URL = savedUrl;
    if (savedCmd) process.env.MEMPALACE_MCP_CMD = savedCmd;
  }
  return runtime;
}

describe("plugin-mempalace structure", () => {
  it("should have correct name", () => {
    expect(memPalacePlugin.name).toBe("plugin-mempalace");
  });

  it("should have 3 actions", () => {
    expect(memPalacePlugin.actions).toHaveLength(3);
  });

  it("should have 1 provider", () => {
    expect(memPalacePlugin.providers).toHaveLength(1);
  });

  it("should have MemPalaceService", () => {
    expect(memPalacePlugin.services).toContain(MemPalaceService);
  });

  it("should have expected action names", () => {
    const names = memPalacePlugin.actions?.map((a) => a.name) ?? [];
    expect(names).toContain("STORE_PALACE_MEMORY");
    expect(names).toContain("RECALL_PALACE_MEMORY");
    expect(names).toContain("CALL_MEMPALACE_TOOL");
  });

  it("should have context provider", () => {
    const providerName = memPalacePlugin.providers?.[0]?.name;
    expect(providerName).toBe("MEMPALACE_CONTEXT");
  });
});

describe("MemPalaceService", () => {
  it("should have correct serviceType", () => {
    expect(MemPalaceService.serviceType).toBe("mempalace");
  });

  it("should have capabilityDescription", () => {
    const service = new MemPalaceService({} as IAgentRuntime);
    expect(service.capabilityDescription).toContain("MemPalace");
  });
});

describe("action validation", () => {
  it("storeMemory should validate when service exists", async () => {
    const runtime = await createMockRuntime(true);
    const action = memPalacePlugin.actions?.find(
      (a) => a.name === "STORE_PALACE_MEMORY"
    );
    if (!action) throw new Error("action not found");
    const valid = await action.validate(runtime, {} as any, undefined);
    expect(valid).toBe(true);
  });

  it("recallMemory should validate when service exists", async () => {
    const runtime = await createMockRuntime(true);
    const action = memPalacePlugin.actions?.find(
      (a) => a.name === "RECALL_PALACE_MEMORY"
    );
    if (!action) throw new Error("action not found");
    const valid = await action.validate(runtime, {} as any, undefined);
    expect(valid).toBe(true);
  });

  it("callMempalaceTool should validate when service exists", async () => {
    const runtime = await createMockRuntime(true);
    const action = memPalacePlugin.actions?.find(
      (a) => a.name === "CALL_MEMPALACE_TOOL"
    );
    if (!action) throw new Error("action not found");
    const valid = await action.validate(runtime, {} as any, undefined);
    expect(valid).toBe(true);
  });

  it("storeMemory should fail when service not configured", async () => {
    const runtime = await createMockRuntime(false);
    const action = memPalacePlugin.actions?.find(
      (a) => a.name === "STORE_PALACE_MEMORY"
    );
    if (!action) throw new Error("action not found");
    const valid = await action.validate(runtime, {} as any, undefined);
    expect(valid).toBe(false);
  });

  it("callMempalaceTool should fail when service not configured", async () => {
    const runtime = await createMockRuntime(false);
    const action = memPalacePlugin.actions?.find(
      (a) => a.name === "CALL_MEMPALACE_TOOL"
    );
    if (!action) throw new Error("action not found");
    const valid = await action.validate(runtime, {} as any, undefined);
    expect(valid).toBe(false);
  });
});
