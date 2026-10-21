/** Offline REA -> OKF/replay adapter. Uses the same application services as CLI/MCP. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { createGoBinaryService } from "../../src/composition/go.js";
import { createRustBinaryService } from "../../src/composition/rust.js";
import { CdpBrowserProvider } from "../../src/browser/CdpBrowserProvider.js";
import { compareWebScreenshotEvidence } from "../../src/application/BrowserObservationService.js";
import { createWebScreenshotArtifact } from "../../src/domain/webScreenshot.js";
import { parseEvidence, type Evidence } from "../../src/domain/evidence.js";
import { digestCanonicalValue } from "../../src/domain/canonicalDigest.js";
import {
  frontendOptionsSchema,
  generateFrontend,
  writeFrontend,
} from "../../packages/rea-rl/src/frontend.js";

const id = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/)
  .refine(
    (value) =>
      value !== "index" &&
      value !== "log" &&
      !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(value),
    "Reserved OKF filename",
  );
const localPath = z.string().refine(isAbsolute, "Use an absolute local path");
const scalar = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const actionSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    id,
    operation: z.literal("generate_frontend"),
    path: localPath,
    layout: frontendOptionsSchema.shape.layout,
    theme: frontendOptionsSchema.shape.theme,
  }),
  z.strictObject({
    id,
    operation: z.literal("inspect_go_binary"),
    path: localPath,
  }),
  z.strictObject({
    id,
    operation: z.literal("inspect_rust_binary"),
    path: localPath,
  }),
  z.strictObject({
    id,
    operation: z.literal("read_evidence"),
    path: localPath,
  }),
  z.strictObject({
    id,
    operation: z.literal("compare_web_screenshots"),
    before: localPath,
    after: localPath,
  }),
]);
const condition = z.discriminatedUnion("operator", [
  z.strictObject({ operator: z.literal("equals"), value: scalar }),
  z.strictObject({ operator: z.literal("lte"), value: z.number().finite() }),
]);
export const manifestSchema = z
  .strictObject({
    version: z.literal(1),
    max_steps: z.number().int().positive(),
    actions: z.array(actionSchema).min(1),
    goals: z
      .array(
        z.strictObject({
          id,
          title: z.string().min(1),
          actions: z.array(id).min(1),
          pointer: z.string().regex(/^(\/([^~]|~[01])*)+$/),
          condition,
          confidence: z
            .array(z.enum(["observed", "derived"]))
            .min(1)
            .default(["observed", "derived"]),
        }),
      )
      .min(1),
  })
  .superRefine((value, ctx) => {
    const actions = new Set(value.actions.map((a) => a.id));
    if (
      actions.size !== value.actions.length ||
      new Set(value.goals.map((g) => g.id)).size !== value.goals.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Action and goal IDs must each be unique",
      });
    for (const goal of value.goals)
      if (goal.actions.some((a) => !actions.has(a)))
        ctx.addIssue({
          code: "custom",
          message: `Unknown action in goal ${goal.id}`,
        });
  });
export type Manifest = z.infer<typeof manifestSchema>;
type Action = Manifest["actions"][number];
type Record = { id: string; evidence: Evidence | null; error: string | null };

export async function execute(action: Action): Promise<Evidence> {
  if (action.operation === "generate_frontend")
    return generateFrontend(JSON.parse(await readFile(action.path, "utf8")), {
      layout: action.layout,
      theme: action.theme,
    });
  if (action.operation === "read_evidence")
    return parseEvidence(JSON.parse(await readFile(action.path, "utf8")));
  if (action.operation === "compare_web_screenshots") {
    const provider = new CdpBrowserProvider();
    try {
      const result = await compareWebScreenshotEvidence(provider, {
        before: createWebScreenshotArtifact(await readFile(action.before)),
        after: createWebScreenshotArtifact(await readFile(action.after)),
        channel_threshold: 0,
      });
      if (!result.ok) throw result.error;
      return parseEvidence(result.value);
    } finally {
      await provider.close();
    }
  }
  const service =
    action.operation === "inspect_go_binary"
      ? createGoBinaryService()
      : createRustBinaryService();
  try {
    const result = await service.inspect({ path: action.path });
    if (!result.ok) throw result.error;
    return parseEvidence(result.value);
  } finally {
    await service.close();
  }
}

/** Missing fields differ from explicit null; only own JSON properties may be read. */
export function pointerValue(value: unknown, pointer: string): unknown {
  for (const key of pointer
    .slice(1)
    .split("/")
    .map((k) => k.replace(/~1/g, "/").replace(/~0/g, "~"))) {
    if (
      typeof value !== "object" ||
      value === null ||
      !Object.hasOwn(value, key)
    )
      return undefined;
    value = Reflect.get(value, key);
  }
  return value;
}

export function project(manifest: Manifest, records: Record[]) {
  return {
    version: 1,
    mode: "offline-replay",
    manifest_sha256: digestCanonicalValue(manifest),
    max_steps: manifest.max_steps,
    goals: manifest.goals.map((g) => ({ id: g.id, title: g.title })),
    actions: records.map((record) => {
      const evidence =
        record.evidence === null ? null : parseEvidence(record.evidence);
      return {
        id: record.id,
        error: record.error,
        evidence_id: evidence?.evidence_id ?? null,
        confidence: evidence?.confidence ?? null,
        limitations: evidence?.limitations ?? [],
        // Matches are recomputed from authenticated Evidence, never from editable OKF tags.
        goals: manifest.goals.map((goal) => {
          if (!evidence || !goal.actions.includes(record.id)) return 0;
          const value = pointerValue(evidence.normalized_result, goal.pointer);
          const matches =
            goal.condition.operator === "equals"
              ? value === goal.condition.value
              : typeof value === "number" && value <= goal.condition.value;
          if (!matches) return 0;
          if (evidence.confidence === "inferred") return 1;
          if (!goal.confidence.includes(evidence.confidence)) return 0;
          return evidence.confidence === "derived" ? 2 : 3;
        }),
      };
    }),
  };
}

/** JSON mappings are valid YAML, avoiding ambiguous strings and YAML object tags. */
function concept(metadata: object, body: string) {
  return `---\n${JSON.stringify(metadata)}\n---\n\n${body}\n`;
}

export async function collect(manifest: Manifest, output: string) {
  await mkdir(output); // New explicit output only; never overwrite a prior collection.
  await mkdir(join(output, "evidence"));
  const records: Record[] = [];
  for (const action of manifest.actions) {
    try {
      records.push({
        id: action.id,
        evidence: await execute(action),
        error: null,
      });
    } catch (error) {
      records.push({
        id: action.id,
        evidence: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  await writeFile(
    join(output, "collection.json"),
    JSON.stringify({ manifest, records }, null, 2),
  );
  await exportFrontends(records, join(output, "frontends"));
  await writeFile(
    join(output, "index.md"),
    '---\nokf_version: "0.2"\n---\n\n# REA observations\n\n' +
      records
        .map(
          (r) =>
            `- [${r.id}](evidence/${r.id}.md) — ${r.evidence?.confidence ?? "failed"}`,
        )
        .join("\n") +
      "\n",
  );
  for (const record of records) {
    const evidence = record.evidence;
    const tag =
      evidence?.confidence === "observed"
        ? "seen"
        : evidence?.confidence === "inferred"
          ? "guessed"
          : evidence
            ? "derived"
            : "unknown";
    await writeFile(
      join(output, "evidence", `${record.id}.md`),
      concept(
        {
          type: "REA Evidence",
          title: record.id,
          tags: [tag],
          sources: [
            {
              resource: "../collection.json",
              title: "REA collection with complete Evidence records",
            },
          ],
          rea_evidence_id: evidence?.evidence_id ?? null,
          rea_confidence: evidence?.confidence ?? null,
          rea_limitations: evidence?.limitations ?? [],
        },
        evidence
          ? `Evidence record: ${evidence.evidence_id}\n\nOperation: ${evidence.operation}\n\nSee the complete record in collection.json. A tag is not a verification attestation.`
          : `The action failed. See collection.json for the diagnostic.`,
      ),
    );
  }
  return project(manifest, records);
}

export async function loadCollection(path: string) {
  const raw = JSON.parse(await readFile(path, "utf8"));
  const manifest = manifestSchema.parse(raw.manifest);
  if (
    !Array.isArray(raw.records) ||
    raw.records.length !== manifest.actions.length
  )
    throw new Error(
      "Collection must contain exactly one record for each declared action",
    );
  const records: Record[] = raw.records.map((r: unknown, i: number) => {
    const record = z
      .strictObject({ id, evidence: z.unknown(), error: z.string().nullable() })
      .parse(r);
    const action = manifest.actions[i]!;
    if (record.id !== action.id)
      throw new Error("Collection action ordering or identity mismatch");
    if (record.evidence === null) {
      if (!record.error)
        throw new Error("Missing Evidence requires an explicit failure");
      return { id: record.id, evidence: null, error: record.error };
    }
    if (record.error !== null)
      throw new Error("Evidence and error are mutually exclusive");
    const evidence = parseEvidence(record.evidence);
    if (
      action.operation !== "read_evidence" &&
      evidence.operation !== action.operation
    )
      throw new Error("Evidence operation differs from the selected action");
    if (
      (action.operation === "inspect_go_binary" ||
        action.operation === "inspect_rust_binary") &&
      evidence.parameters.path !== action.path
    )
      throw new Error("Evidence target differs from the selected path");
    if (
      action.operation === "generate_frontend" &&
      (evidence.parameters.layout !== action.layout ||
        evidence.parameters.theme !== action.theme)
    )
      throw new Error(
        "Generated frontend options differ from the selected action",
      );
    return { id: record.id, evidence, error: null };
  });
  return project(manifest, records);
}

export async function exportFrontends(records: Record[], output: string) {
  const generated = records.filter(
    (r) => r.evidence?.operation === "generate_frontend",
  );
  if (!generated.length) return [];
  await mkdir(output);
  for (const record of generated) {
    id.parse(record.id);
    await writeFrontend(record.evidence, join(output, record.id));
  }
  return generated.map((r) => r.id);
}

/** Execute only a declared action; bind every live step to the initial task. */
export async function act(
  manifest: Manifest,
  actionId: string,
  expectedDigest: string,
) {
  if (digestCanonicalValue(manifest) !== expectedDigest)
    throw new Error("Task manifest changed since environment initialization");
  const action = manifest.actions.find((a) => a.id === actionId);
  if (!action) throw new Error("Action is not declared in this task");
  let record: Record;
  try {
    record = { id: action.id, evidence: await execute(action), error: null };
  } catch (error) {
    record = {
      id: action.id,
      evidence: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  return { ...project(manifest, [record]), mode: "live-static", record };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [command, input, output, expectedDigest] = process.argv.slice(2);
  try {
    if (
      !input ||
      !["collect", "verify", "describe", "act", "export-frontends"].includes(
        command ?? "",
      ) ||
      (command === "collect" && !output) ||
      (command === "act" && (!output || !expectedDigest)) ||
      (command === "export-frontends" && !output)
    )
      throw new Error(
        "Usage: bridge.ts collect MANIFEST NEW_OUTPUT_DIR | verify COLLECTION | describe MANIFEST | act MANIFEST ACTION_ID MANIFEST_SHA256",
      );
    let result: unknown;
    if (command === "export-frontends") {
      const raw = z
        .array(
          z.strictObject({
            id,
            evidence: z.unknown(),
            error: z.string().nullable(),
          }),
        )
        .parse(JSON.parse(await readFile(input, "utf8")));
      // Keep each action's last successful generation; retain all step records.
      const records = [
        ...new Map(
          raw
            .filter((r) => r.evidence !== null && r.error === null)
            .map((r) => [
              r.id,
              {
                ...r,
                evidence:
                  r.evidence === null ? null : parseEvidence(r.evidence),
              },
            ]),
        ).values(),
      ];
      result = await exportFrontends(records, resolve(output!));
    } else if (command === "verify") result = await loadCollection(input);
    else {
      const manifest = manifestSchema.parse(
        JSON.parse(await readFile(input, "utf8")),
      );
      if (command === "collect")
        result = await collect(manifest, resolve(output!));
      else if (command === "act")
        result = await act(manifest, output!, expectedDigest!);
      else
        result = {
          ...project(
            manifest,
            manifest.actions.map((a) => ({
              id: a.id,
              evidence: null,
              error: "Not attempted",
            })),
          ),
          mode: "live-static",
        };
    }
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
