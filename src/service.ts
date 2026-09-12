/**
 * MemPalaceService — manages the MemPalace MCP client lifecycle.
 *
 * Supports two transport modes:
 *   1. stdio — spawn the MemPalace MCP server as a subprocess
 *   2. http  — connect to a running MemPalace HTTP/SSE server
 *
 * The service lazily connects on first use and reuses the connection
 * for all subsequent calls. Responses are unwrapped from the standard
 * MCP content-array format so callers receive clean JSON objects.
 */

import type { IAgentRuntime } from "@elizaos/core";
import { logger, Service } from "@elizaos/core";
import { spawn, type ChildProcess } from "node:child_process";

/** JSON-RPC 2.0 request envelope for MCP. */
interface McpRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

/** JSON-RPC 2.0 response envelope. */
interface McpResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type MemPalaceTransport = "stdio" | "http";

export class MemPalaceService extends Service {
  static serviceType = "mempalace";
  capabilityDescription =
    "Persistent agent memory via MemPalace MCP — store, search, and query a knowledge graph across sessions. Supports stdio and HTTP/SSE transports.";

  private transport: MemPalaceTransport = "stdio";
  private mcpCmd: string | null = null;
  private mcpUrl: string | null = null;
  private palaceDir: string | null = null;
  private proc: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private buffer = "";
  private initialized = false;

  static async start(runtime: IAgentRuntime): Promise<MemPalaceService> {
    const service = new MemPalaceService(runtime);
    service.configure(runtime);
    return service;
  }

  async stop(): Promise<void> {
    if (this.proc) {
      this.proc.kill("SIGTERM");
      this.proc = null;
    }
    this.initialized = false;
    logger.debug("MemPalaceService stopped");
  }

  private configure(runtime: IAgentRuntime): void {
    const cmdRaw = runtime.getSetting("MEMPALACE_MCP_CMD") || process.env.MEMPALACE_MCP_CMD;
    const urlRaw = runtime.getSetting("MEMPALACE_MCP_URL") || process.env.MEMPALACE_MCP_URL;
    const dirRaw = runtime.getSetting("MEMPALACE_DIR") || process.env.MEMPALACE_DIR;

    this.mcpCmd = cmdRaw ? String(cmdRaw) : null;
    this.mcpUrl = urlRaw ? String(urlRaw) : null;
    this.palaceDir = dirRaw ? String(dirRaw) : null;

    if (this.mcpUrl) {
      this.transport = "http";
      logger.info(`MemPalaceService configured for HTTP transport: ${this.mcpUrl}`);
    } else if (this.mcpCmd) {
      this.transport = "stdio";
      logger.info(`MemPalaceService configured for stdio transport: ${this.mcpCmd}`);
    } else {
      logger.warn(
        "MemPalaceService: no MEMPALACE_MCP_CMD or MEMPALACE_URL set — memory features disabled."
      );
    }
  }

  /**
   * Unwrap a standard MCP tool-call result.
   *
   * MCP wraps tool results in { content: [{ type: "text", text: "..." }] }.
   * This extracts the text, parses it as JSON, and returns the clean object.
   * If the result doesn't match this shape, it's returned as-is.
   */
  private unwrapMcpResult(result: unknown): unknown {
    if (result && typeof result === "object" && "content" in result) {
      const content = (result as any).content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item?.type === "text" && typeof item.text === "string") {
            try {
              return JSON.parse(item.text);
            } catch {
              return item.text;
            }
          }
        }
      }
    }
    return result;
  }

  /**
   * Call a MemPalace MCP tool by name with the given arguments.
   * Returns the unwrapped result (clean JSON object, not MCP content array).
   */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.mcpCmd && !this.mcpUrl) {
      throw new Error("MemPalace not configured — set MEMPALACE_MCP_CMD or MEMPALACE_URL");
    }

    let raw: unknown;
    if (this.transport === "http") {
      raw = await this.callHttp(name, args);
    } else {
      raw = await this.callStdio(name, args);
    }
    return this.unwrapMcpResult(raw);
  }

  /** Check if MemPalace is available. */
  isAvailable(): boolean {
    return !!(this.mcpCmd || this.mcpUrl);
  }

  // --- HTTP transport ---

  private async callHttp(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.mcpUrl) throw new Error("MemPalace URL not set");
    const res = await fetch(this.mcpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: this.nextId++,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });
    if (!res.ok) {
      throw new Error(`MemPalace HTTP ${res.status}: ${await res.text().catch(() => "")}`);
    }
    const data = await res.json() as McpResponse;
    if (data.error) {
      throw new Error(`MemPalace error: ${data.error.message}`);
    }
    return data.result;
  }

  // --- stdio transport ---

  private async ensureStdioProcess(): Promise<void> {
    if (this.proc && this.proc.exitCode === null) return;
    if (!this.mcpCmd) throw new Error("MemPalace command not set");

    const env: Record<string, string> = { ...process.env as Record<string, string> };
    if (this.palaceDir) env.MEMPALACE_DIR = this.palaceDir;

    this.proc = spawn(this.mcpCmd, [], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });

    this.proc.stdout?.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });

    this.proc.stderr?.on("data", (chunk: Buffer) => {
      logger.debug(`MemPalace stderr: ${chunk.toString().trim()}`);
    });

    this.proc.on("exit", (code) => {
      logger.warn(`MemPalace process exited with code ${code}`);
      this.proc = null;
      // Reject all pending requests
      for (const [, { reject }] of this.pending) {
        reject(new Error("MemPalace process exited"));
      }
      this.pending.clear();
    });

    // Send initialize request
    await this.sendRpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "elizaos-plugin-mempalace", version: "1.0.0" },
    });

    this.initialized = true;
    logger.info("MemPalace stdio process initialized");
  }

  private async callStdio(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.ensureStdioProcess();
    return this.sendRpc("tools/call", { name, arguments: args });
  }

  private async sendRpc(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.proc || this.proc.exitCode !== null) {
      await this.ensureStdioProcess();
    }
    if (!this.proc?.stdin) throw new Error("MemPalace stdin not available");

    const id = this.nextId++;
    const request: McpRequest = { jsonrpc: "2.0", id, method, params };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MemPalace request timeout: ${method}`));
      }, 30000);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.proc!.stdin!.write(JSON.stringify(request) + "\n");
    });
  }

  private processBuffer(): void {
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;

      try {
        const msg = JSON.parse(line) as McpResponse;
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const handler = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) {
            handler.reject(new Error(`MemPalace: ${msg.error.message}`));
          } else {
            handler.resolve(msg.result);
          }
        }
      } catch {
        // Not a valid JSON-RPC line — skip
      }
    }
  }
}
