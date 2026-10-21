import { createHash } from "node:crypto";
import { parseEvidence, type Evidence } from "../../../src/domain/evidence.js";
import type { CallToolResult } from "@modelcontextprotocol/server";

export const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
export function pointer(value: unknown, path: string) {
  if (!path) return value;
  if (!path.startsWith("/") || /~(?![01])/u.test(path))
    throw new Error("Invalid JSON Pointer");
  for (const key of path
    .slice(1)
    .split("/")
    .map((k) => k.replace(/~1/g, "/").replace(/~0/g, "~"))) {
    if (!record(value) && !Array.isArray(value)) return undefined;
    if (!Object.hasOwn(value, key)) return undefined;
    value = Reflect.get(value, key);
  }
  return value;
}
export function unwrap(raw: CallToolResult): unknown {
  if (raw.structuredContent !== undefined) return raw.structuredContent;
  const texts = raw.content.filter((c) => c.type === "text").map((c) => c.text);
  if (texts.length === 1) {
    try {
      return JSON.parse(texts[0]!);
    } catch {
      /* plain text is valid MCP content */
    }
  }
  return { text: texts.join("\n") };
}
export function evidenceOf(value: unknown): Evidence | undefined {
  const candidates = [
    value,
    record(value) ? value.evidence : undefined,
    record(value) ? value.result : undefined,
  ];
  for (const candidate of candidates)
    if (
      record(candidate) &&
      typeof candidate.evidence_id === "string" &&
      "normalized_result" in candidate
    )
      return parseEvidence(candidate);
  return undefined;
}
export interface StoredResult {
  id: string;
  tool: string;
  raw: CallToolResult;
  json: unknown;
  evidence: Evidence | undefined;
  bytes: number;
}
export class ResultStore {
  private items = new Map<string, StoredResult>();
  private bytes = 0;
  constructor(readonly budget = 64 * 1024 * 1024) {}
  add(tool: string, raw: CallToolResult): StoredResult {
    const wire = JSON.stringify(raw),
      bytes = Buffer.byteLength(wire);
    if (bytes > this.budget)
      throw new Error(
        "Result exceeds retention capacity. Use the upstream retained Evidence/export tools.",
      );
    const id =
      "res_" +
      createHash("sha256")
        .update(tool + "\0" + wire)
        .digest("hex");
    const existing = this.items.get(id);
    if (existing) return existing;
    const json = unwrap(raw),
      evidence = evidenceOf(json);
    while (this.bytes + bytes > this.budget) {
      const oldest = this.items.keys().next().value as string;
      this.bytes -= this.items.get(oldest)!.bytes;
      this.items.delete(oldest);
    }
    const item = { id, tool, raw, json, evidence, bytes };
    this.items.set(id, item);
    this.bytes += bytes;
    return item;
  }
  get(id: string) {
    const item = this.items.get(id);
    if (!item)
      throw new Error("Result is unknown or expired from the session cache");
    return item;
  }
  clear() {
    this.items.clear();
    this.bytes = 0;
  }
}
const omitted = new Set(["raw_result", "data_base64", "files"]);
function preview(value: unknown, depth = 0): unknown {
  if (typeof value === "string")
    return value.length > 240
      ? { excerpt: value.slice(0, 240), total_chars: value.length }
      : value;
  if (Array.isArray(value))
    return {
      count: value.length,
      sample:
        depth < 3
          ? value.slice(0, 3).map((v) => preview(v, depth + 1))
          : undefined,
    };
  if (!record(value)) return value;
  const entries = Object.entries(value),
    keys = entries.map(([k]) => k);
  if (depth >= 3) return { keys };
  return Object.fromEntries(
    entries
      .filter(([k]) => !omitted.has(k))
      .slice(0, 12)
      .map(([k, v]) => [k, preview(v, depth + 1)]),
  );
}
export function summarize(item: StoredResult, chars = 3500) {
  const evidence = item.evidence,
    source = evidence?.normalized_result ?? item.json;
  const p = JSON.stringify(preview(source));
  return {
    result_id: item.id,
    tool: item.tool,
    is_error: item.raw.isError === true,
    evidence_id: evidence?.evidence_id,
    confidence: evidence?.confidence,
    authority: evidence?.authority,
    limitations: (evidence?.limitations ?? [])
      .slice(0, 8)
      .map((value) =>
        value.length > 300 ? value.slice(0, 300) + " [excerpt]" : value,
      ),
    limitations_total: evidence?.limitations.length ?? 0,
    limitations_complete:
      !evidence ||
      (evidence.limitations.length <= 8 &&
        evidence.limitations.every((value) => value.length <= 300)),
    preview:
      p.length > chars
        ? { excerpt: p.slice(0, chars), truncated: true }
        : JSON.parse(p),
    complete_result_available: true,
    retention: "session cache; oldest results expire at capacity",
    full_wire_bytes: item.bytes,
    token_count: "not measured",
    next: "Use rea_result with a JSON Pointer into the original result. Use rea_visual only for a specific visual question.",
  };
}
export const textResult = (value: unknown): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
});
