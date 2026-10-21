import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createEvidence } from "../../src/domain/evidence.js";
import { digestCanonicalValue } from "../../src/domain/canonicalDigest.js";
import {
  act,
  collect,
  execute,
  loadCollection,
  manifestSchema,
  pointerValue,
  project,
} from "./bridge.js";

const plan = () =>
  manifestSchema.parse({
    version: 1,
    max_steps: 3,
    actions: [
      { id: "go", operation: "inspect_go_binary", path: process.execPath },
    ],
    goals: [
      {
        id: "format",
        title: "Identify executable format",
        actions: ["go"],
        pointer: "/format",
        condition: {
          operator: "equals",
          value:
            process.platform === "win32"
              ? "pe"
              : process.platform === "darwin"
                ? "macho"
                : "elf",
        },
      },
    ],
  });

test("live steps bind the task and execute only a selected declared action", async () => {
  const p = plan();
  const digest = digestCanonicalValue(p);
  await assert.rejects(act(p, "go", "wrong"), /manifest changed/);
  await assert.rejects(act(p, "undeclared", digest), /not declared/);
  const result = await act(p, "go", digest);
  assert.equal(result.mode, "live-static");
  assert.equal(result.record.error, null);
  assert.equal(result.actions.length, 1);
  assert.deepEqual(result.actions[0]!.goals, [3]);
});

test("rejects empty tasks, duplicate IDs, missing action references and reserved OKF names", () => {
  const p = plan();
  assert.throws(() => manifestSchema.parse({ ...p, goals: [] }));
  assert.throws(() =>
    manifestSchema.parse({ ...p, actions: [p.actions[0], p.actions[0]] }),
  );
  assert.throws(() =>
    manifestSchema.parse({
      ...p,
      goals: [{ ...p.goals[0], actions: ["missing"] }],
    }),
  );
  assert.throws(() =>
    manifestSchema.parse({ ...p, goals: [{ ...p.goals[0], id: "index" }] }),
  );
});

test("JSON pointers preserve missing vs null and escaped property names", () => {
  assert.equal(pointerValue({ "a/b": { "~": null } }, "/a~1b/~0"), null);
  assert.equal(pointerValue({}, "/missing"), undefined);
  assert.equal(pointerValue({}, "/constructor"), undefined);
});

test("inference is not a solved goal; missing or null does not satisfy numeric thresholds", () => {
  const p = plan();
  const evidence = createEvidence(
    undefined,
    { id: "test", name: "Test", version: null },
    {
      operation: "inspect_go_binary",
      parameters: {},
      result: { format: p.goals[0]!.condition.value },
      confidence: "inferred",
    },
  );
  assert.deepEqual(
    project(p, [{ id: "go", evidence, error: null }]).actions[0]!.goals,
    [1],
  );
  const numeric = manifestSchema.parse({
    ...p,
    goals: [
      {
        ...p.goals[0],
        pointer: "/ratio",
        condition: { operator: "lte", value: 0.1 },
      },
    ],
  });
  assert.deepEqual(
    project(numeric, [{ id: "go", evidence, error: null }]).actions[0]!.goals,
    [0],
  );
});

test("real REA inspection -> OKF -> verified replay; tampering is rejected", async () => {
  const parent = await mkdtemp(join(tmpdir(), "rea-okf-test-"));
  try {
    const output = join(parent, "bundle");
    const result = await collect(plan(), output);
    assert.equal(result.actions[0]!.error, null);
    assert.deepEqual(result.actions[0]!.goals, [3]);
    assert.deepEqual(
      await loadCollection(join(output, "collection.json")),
      result,
    );
    assert.match(
      await readFile(join(output, "index.md"), "utf8"),
      /okf_version: "0.2"/,
    );
    // Editing the OKF projection cannot manufacture a reward.
    await writeFile(
      join(output, "evidence", "go.md"),
      '---\n{"type":"REA Evidence","tags":["guessed"]}\n---\n',
    );
    assert.deepEqual(
      await loadCollection(join(output, "collection.json")),
      result,
    );
    const raw = JSON.parse(
      await readFile(join(output, "collection.json"), "utf8"),
    );
    raw.records[0].evidence.normalized_result.format = "tampered";
    await writeFile(join(output, "collection.json"), JSON.stringify(raw));
    await assert.rejects(loadCollection(join(output, "collection.json")));
    await assert.rejects(collect(plan(), output));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("frontend comparison uses real REA pixel comparison on a repository screenshot", async () => {
  const path = resolve("docs/assets/rea-hopper-analysis.png");
  const evidence = await execute({
    id: "visual",
    operation: "compare_web_screenshots",
    before: path,
    after: path,
  });
  assert.equal(evidence.operation, "compare_web_screenshots");
  assert.equal(
    (evidence.normalized_result as { changed_ratio: number }).changed_ratio,
    0,
  );
});
