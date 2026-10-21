import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { PNG } from "pngjs";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { createEvidence } from "../../../src/domain/evidence.js";
import { jsonValueSchema } from "../../../src/domain/jsonValue.js";
import { passiveNetworkCapture } from "../../../tests/fixtures/passiveNetworkCapture.js";

const json = (result: CallToolResult) => {
  assert.ok(!result.isError, JSON.stringify(result));
  const c = result.content.find((c) => c.type === "text");
  assert.ok(c?.type === "text");
  return JSON.parse(c.text);
};
test("real stdio server discovers and calls published REA, learns feedback, retrieves text/images and exports OKF", async (t) => {
  const parent = await mkdtemp(join(tmpdir(), "rea-rl-product-"));
  const client = new Client({ name: "product-integration", version: "1" });
  const cli = process.env.REA_RL_TEST_BIN;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: cli
      ? [cli, "mcp"]
      : ["--import", "tsx", resolve("src/cli.ts"), "mcp"],
    cwd: process.cwd(),
    stderr: "inherit",
  });
  try {
    await client.connect(transport);
    const visible = (await client.listTools()).tools;
    assert.equal(visible.length, 8);
    const found = json(
      await client.callTool({
        name: "rea_discover",
        arguments: { query: "inspect_go_binary", detail: "schema" },
      }),
    );
    assert.equal(found.tools[0].name, "inspect_go_binary");
    assert.ok(found.tools[0].inputSchema);
    const context = {
      domain: "analysis",
      target: "native",
      stage: "inventory",
    };
    const format =
      process.platform === "win32"
        ? "pe"
        : process.platform === "darwin"
          ? "macho"
          : "elf";
    const suggested = json(
      await client.callTool({
        name: "rl_suggest",
        arguments: {
          context,
          candidates: ["inspect_go_binary"],
          goal: { pointer: "/format", operator: "equals", expected: format },
        },
      }),
    );
    const run = await client.callTool({
      name: "rea_run",
      arguments: {
        name: "inspect_go_binary",
        input: { path: process.execPath },
        decision_id: suggested.decision_id,
      },
    });
    const summary = json(run);
    assert.ok(summary.evidence_id.startsWith("ev_"));
    assert.ok(!run.content.some((c) => c.type === "image"));
    const value = json(
      await client.callTool({
        name: "rea_result",
        arguments: {
          result_id: summary.result_id,
          pointer: "/normalized_result/format",
        },
      }),
    );
    assert.equal(JSON.parse(value.text), format);
    const feedback = json(
      await client.callTool({
        name: "rl_feedback",
        arguments: {
          decision_id: suggested.decision_id,
          next_context: context,
          done: true,
        },
      }),
    );
    assert.equal(feedback.goal_passed, true);
    const file = join(parent, "sample.png"),
      png = new PNG({ width: 256, height: 128 });
    png.data.fill(255);
    await writeFile(file, PNG.sync.write(png));
    const visual = await client.callTool({
      name: "rea_visual",
      arguments: { path: file, reason: "layout_geometry", max_dimension: 128 },
    });
    assert.ok(visual.content.some((c) => c.type === "image"));
    const output = join(parent, "okf");
    json(
      await client.callTool({
        name: "okf_export",
        arguments: {
          result_ids: [summary.result_id],
          output_dir: output,
          include_policy: true,
        },
      }),
    );
    assert.match(
      await readFile(join(output, "index.md"), "utf8"),
      /okf_version: "0.2"/,
    );
    assert.ok(
      !(await readFile(join(output, "policy.json"), "utf8")).includes(
        process.execPath,
      ),
    );
    const page = passiveNetworkCapture([]);
    page.accessibility.text_capture.status = "included";
    page.accessibility.nodes = [
      {
        node_id: "root",
        parent_id: null,
        role: "RootWebArea",
        name: "Fixture",
        ignored: false,
        description: null,
        states: [],
      },
      {
        node_id: "heading",
        parent_id: "root",
        role: "heading",
        name: "Product fixture",
        ignored: false,
        description: null,
        states: [{ name: "level", value: 1 }],
      },
    ];
    page.accessibility.total_nodes = page.accessibility.nodes.length;
    const source = createEvidence(
      undefined,
      { id: "fixture", name: "Synthetic test fixture", version: "1" },
      {
        operation: "inspect_web_page",
        parameters: {},
        result: jsonValueSchema.parse(page),
        confidence: "observed",
        authority: "external-service",
      },
    );
    const evidencePath = join(parent, "page.json");
    await writeFile(evidencePath, JSON.stringify(source));
    const preview = join(parent, "frontend");
    const generated = json(
      await client.callTool({
        name: "frontend_generate",
        arguments: {
          evidence_path: evidencePath,
          output_dir: preview,
          layout: "cards",
          theme: "dark",
        },
      }),
    );
    assert.equal(generated.confidence, "derived");
    assert.match(
      await readFile(join(preview, "index.html"), "utf8"),
      /Product fixture/,
    );
    const duplicate = await client.callTool({
      name: "frontend_generate",
      arguments: {
        evidence_path: evidencePath,
        output_dir: preview,
        layout: "cards",
        theme: "dark",
      },
    });
    assert.equal(duplicate.isError, true);
    const prompt = await client.getPrompt({
      name: "reverse_engineer",
      arguments: { objective: "Inspect the selected target using text first" },
    });
    assert.equal(prompt.messages.length, 1);
    t.diagnostic(
      `Visible tools: ${visible.length}; selected result original wire bytes: ${summary.full_wire_bytes}; text reply bytes: ${Buffer.byteLength(JSON.stringify(run))}. These are bytes, not measured tokens.`,
    );
  } finally {
    await client.close();
    await rm(parent, { recursive: true, force: true });
  }
});
