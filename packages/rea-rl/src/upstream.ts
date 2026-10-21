import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { CallToolResult } from "@modelcontextprotocol/server";

export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}
export interface ReaConnection {
  tools(): Promise<ToolInfo[]>;
  call(
    name: string,
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<CallToolResult>;
  close(): Promise<void>;
}
export function reaScript() {
  return join(
    dirname(createRequire(import.meta.url).resolve("rea-agents/package.json")),
    "scripts",
    "rea.mjs",
  );
}
export class ReaUpstream implements ReaConnection {
  private pending: Promise<Client> | undefined;
  private closing = false;
  constructor(readonly script = reaScript()) {}
  private connect() {
    if (this.closing) throw new Error("REA connection is closing");
    this.pending ??= this.open().catch((error) => {
      this.pending = undefined;
      throw error;
    });
    return this.pending;
  }
  private async open() {
    const client = new Client({ name: "rea-rl-mcp", version: "0.1.0" });
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    );
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [this.script, "mcp"],
      env,
      stderr: "inherit",
      maxBufferSize: 16 * 1024 * 1024,
    });
    try {
      await client.connect(transport);
      if (this.closing) {
        await client.close();
        throw new Error("REA connection closed during startup");
      }
      return client;
    } catch (error) {
      await transport.close();
      throw error;
    }
  }
  async tools() {
    return (await (await this.connect()).listTools()).tools as ToolInfo[];
  }
  async call(
    name: string,
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ) {
    return await (
      await this.connect()
    ).callTool(
      { name, arguments: input },
      { ...(signal ? { signal } : {}), timeout: 300000 },
    );
  }
  async close() {
    this.closing = true;
    if (this.pending) await (await this.pending).close();
  }
}
