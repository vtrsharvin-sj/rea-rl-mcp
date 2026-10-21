import assert from "node:assert/strict";
import { test } from "node:test";
import { PNG } from "pngjs";
import { ResultStore, pointer, summarize } from "../src/results.js";
import { LearningPolicy, goalSchema } from "../src/policy.js";
import { visualResult } from "../src/visual.js";
const context = {
  domain: "analysis",
  target: "native",
  stage: "inventory",
} as const;

test("result retrieval preserves complete data while text summaries omit binary payloads", () => {
  const store = new ResultStore(),
    raw = {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            nested: { a: null },
            data_base64: "x".repeat(10000),
            items: [1, 2, 3, 4],
          }),
        },
      ],
    };
  const item = store.add("inspect", raw),
    summary = JSON.stringify(summarize(item));
  assert.ok(summary.length < 3000);
  assert.ok(!summary.includes("xxxx"));
  assert.equal(pointer(item.json, "/nested/a"), null);
  assert.equal(pointer(item.json, "/nested/missing"), undefined);
  assert.deepEqual(store.get(item.id).raw, raw);
  assert.throws(() => pointer({}, "/bad~x"));
});
test("retention expiry and oversize errors are explicit", () => {
  const store = new ResultStore(240);
  const first = store.add("a", {
    content: [{ type: "text", text: "x".repeat(120) }],
  });
  store.add("b", { content: [{ type: "text", text: "y".repeat(120) }] });
  assert.throws(() => store.get(first.id), /expired/);
  assert.throws(
    () =>
      store.add("c", { content: [{ type: "text", text: "z".repeat(1000) }] }),
    /capacity/,
  );
});
test("Q-learning binds actual actions, credits a fixed predicate once and keeps context separate", () => {
  const store = new ResultStore(),
    policy = new LearningPolicy((id) => store.get(id));
  const d = policy.suggest(context, ["inspect", "other"], {
    pointer: "/value",
    operator: "equals",
    expected: 1,
  });
  const item = store.add("inspect", {
    content: [],
    structuredContent: { value: 1 },
  });
  assert.throws(() => policy.bind(d.decision_id, "other", item), /differs/);
  policy.bind(d.decision_id, "inspect", item);
  assert.equal(
    policy.feedback(d.decision_id, context, true, undefined).reward,
    0.99,
  );
  assert.throws(
    () => policy.feedback(d.decision_id, context, true, 1),
    /uncredited/,
  );
  assert.equal(
    policy.suggest(context, ["inspect", "other"], undefined).recommended,
    "inspect",
  );
  assert.ok(!JSON.stringify(policy.snapshot()).includes("res_"));
  assert.throws(() =>
    goalSchema.parse({ pointer: "/v", operator: "lte", expected: null }),
  );
  const pending = policy.suggest(context, ["inspect"], undefined);
  policy.assertAction(pending.decision_id, "inspect");
  assert.throws(
    () => policy.assertAction(pending.decision_id, "inspect"),
    /already executed/,
  );
});
test("failed tools cannot earn a goal reward", () => {
  const store = new ResultStore(),
    policy = new LearningPolicy((id) => store.get(id));
  const d = policy.suggest(context, ["tool"], {
    pointer: "/value",
    operator: "equals",
    expected: 1,
  });
  policy.bind(
    d.decision_id,
    "tool",
    store.add("tool", {
      content: [],
      structuredContent: { value: 1 },
      isError: true,
    }),
  );
  const feedback = policy.feedback(d.decision_id, context, true, undefined);
  assert.equal(feedback.goal_passed, false);
  assert.equal(feedback.reward, -1.01);
});
test("visual fallback crops and resizes PNGs with bounded decode admission", () => {
  const png = new PNG({ width: 256, height: 128 });
  png.data.fill(255);
  const result = visualResult(PNG.sync.write(png), "layout_geometry", 128, {
    x: 0,
    y: 0,
    width: 128,
    height: 128,
  });
  const image = result.content.find((c) => c.type === "image");
  assert.ok(image?.type === "image");
  const decoded = PNG.sync.read(Buffer.from(image.data, "base64"));
  assert.equal(decoded.width, 128);
  assert.throws(
    () =>
      visualResult(PNG.sync.write(png), "layout_geometry", 128, {
        x: 255,
        y: 0,
        width: 128,
        height: 128,
      }),
    /outside/,
  );
});
