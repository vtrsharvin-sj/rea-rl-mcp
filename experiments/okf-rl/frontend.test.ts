import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse, serialize } from "parse5";
import { createEvidence } from "../../src/domain/evidence.js";
import { jsonValueSchema } from "../../src/domain/jsonValue.js";
import { passiveNetworkCapture } from "../../tests/fixtures/passiveNetworkCapture.js";
import {
  generateFrontend,
  writeFrontend,
} from "../../packages/rea-rl/src/frontend.js";
import { collect, loadCollection, manifestSchema } from "./bridge.js";

function source() {
  const page = passiveNetworkCapture([]);
  page.accessibility.text_capture.status = "included";
  const node = (
    node_id: string,
    parent_id: string | null,
    role: string,
    name: string,
  ) => ({
    node_id,
    parent_id,
    role,
    name,
    ignored: false,
    description: null,
    states: [] as { name: string; value: string | number | boolean }[],
  });
  page.accessibility.nodes = [
    node("root", null, "RootWebArea", "Test page"),
    {
      ...node("heading", "root", "heading", "Project notes"),
      states: [{ name: "level", value: 1 }],
    },
    node(
      "text",
      "root",
      "StaticText",
      "<script>globalThis.injection = true</script>",
    ),
    node("form", "root", "form", "Project settings"),
    node("native-label", "form", "LabelText", ""),
    node("label-text", "native-label", "StaticText", "Project name"),
    {
      ...node("name", "native-label", "textbox", "Project name"),
      states: [{ name: "required", value: true }],
    },
    {
      ...node("check", "form", "checkbox", "Notifications"),
      states: [{ name: "checked", value: true }],
    },
    node("save", "form", "button", "Save project"),
    node("link", "root", "link", "Overview"),
  ];
  page.accessibility.total_nodes = page.accessibility.nodes.length;
  return createEvidence(
    undefined,
    { id: "fixture", name: "Test fixture", version: "1" },
    {
      operation: "inspect_web_page",
      parameters: {},
      result: jsonValueSchema.parse(page),
      confidence: "observed",
      authority: "external-service",
    },
  );
}

test("generates an escaped, semantic frontend with provenance and local controls", () => {
  const evidence = generateFrontend(source(), {
    layout: "cards",
    theme: "dark",
  });
  const result = evidence.normalized_result as {
    files: { [name: string]: string };
    metrics: { control_count: number };
    unresolved: unknown[];
  };
  const html = result.files["index.html"]!;
  assert.equal(result.metrics.control_count, 3);
  assert.equal(evidence.confidence, "derived");
  assert.deepEqual(evidence.evidence_links, [source().evidence_id]);
  assert.ok(html.includes("<h1"));
  assert.ok(html.includes('type="submit"'));
  assert.ok(html.includes(" required"));
  assert.ok(html.includes(" checked"));
  assert.equal((html.match(/Project name/g) ?? []).length, 1);
  assert.ok(html.includes("&lt;script&gt;"));
  assert.equal((serialize(parse(html)).match(/<script/g) ?? []).length, 1);
  assert.ok(result.unresolved.length >= 2);
});

test("rejects wrong operations, unapproved text, duplicate nodes and cycles", () => {
  const evidence = source();
  assert.throws(
    () =>
      generateFrontend(
        createEvidence(undefined, evidence.provider, {
          operation: "inspect_web_page",
          parameters: {},
          result: evidence.normalized_result,
          confidence: "inferred",
        }),
      ),
    /observed/,
  );
  const make = (
    change: (value: ReturnType<typeof passiveNetworkCapture>) => void,
  ) => {
    const page = structuredClone(evidence.normalized_result) as ReturnType<
      typeof passiveNetworkCapture
    >;
    change(page);
    return createEvidence(undefined, evidence.provider, {
      operation: "inspect_web_page",
      parameters: {},
      result: jsonValueSchema.parse(page),
    });
  };
  assert.throws(
    () =>
      generateFrontend(
        make((p) => {
          p.accessibility.text_capture.status = "not_approved";
        }),
      ),
    /approved/,
  );
  assert.throws(
    () =>
      generateFrontend(
        make((p) => {
          p.accessibility.nodes.push(p.accessibility.nodes[0]!);
        }),
      ),
    /Duplicate/,
  );
  assert.throws(
    () =>
      generateFrontend(
        make((p) => {
          p.accessibility.nodes[0]!.parent_id = "heading";
        }),
      ),
    /Cyclic/,
  );
  assert.throws(
    () =>
      generateFrontend(
        createEvidence(undefined, evidence.provider, {
          operation: "other",
          parameters: {},
          result: {},
        }),
      ),
    /inspect_web_page/,
  );
});

test("writes new runnable projects, rejects tampering and refuses overwrite", async () => {
  const parent = await mkdtemp(join(tmpdir(), "rea-frontend-"));
  try {
    const output = join(parent, "project"),
      evidence = generateFrontend(source());
    await writeFrontend(evidence, output);
    assert.ok(
      (await readFile(join(output, "index.html"), "utf8")).includes(
        "Project notes",
      ),
    );
    assert.ok(
      (await readFile(join(output, "app.js"), "utf8")).includes(
        "reportValidity",
      ),
    );
    await assert.rejects(writeFrontend(evidence, output));
    const tampered = JSON.parse(JSON.stringify(evidence));
    tampered.normalized_result.files["app.js"] += "changed";
    await assert.rejects(writeFrontend(tampered, join(parent, "tampered")));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("RL collection generates an exported frontend and verified replay goal", async () => {
  const parent = await mkdtemp(join(tmpdir(), "rea-frontend-rl-"));
  try {
    const input = join(parent, "page.json");
    await writeFile(input, JSON.stringify(source()));
    const manifest = manifestSchema.parse({
      version: 1,
      max_steps: 2,
      actions: [
        {
          id: "build",
          operation: "generate_frontend",
          path: input,
          layout: "document",
          theme: "light",
        },
      ],
      goals: [
        {
          id: "controls",
          title: "Generate captured local controls",
          actions: ["build"],
          pointer: "/metrics/control_count",
          condition: { operator: "equals", value: 3 },
        },
      ],
    });
    const output = join(parent, "collection");
    const result = await collect(manifest, output);
    assert.deepEqual(result.actions[0]!.goals, [2]);
    assert.ok(
      (
        await readFile(join(output, "frontends", "build", "index.html"), "utf8")
      ).includes("Save project"),
    );
    assert.deepEqual(
      await loadCollection(join(output, "collection.json")),
      result,
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
