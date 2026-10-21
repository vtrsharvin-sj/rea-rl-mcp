import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { StoredResult } from "./results.js";

export async function exportOkf(
  results: StoredResult[],
  output: string,
  policy?: unknown,
) {
  if (!results.length) throw new Error("Select at least one retained result");
  await mkdir(output);
  await mkdir(join(output, "concepts"));
  await mkdir(join(output, "data"));
  const index = [
    "---",
    'okf_version: "0.2"',
    "---",
    "",
    "# Investigation knowledge",
    "",
  ];
  for (const result of results) {
    const confidence = result.evidence?.confidence;
    const tag =
      confidence === "observed"
        ? "seen"
        : confidence === "derived"
          ? "derived"
          : confidence === "inferred"
            ? "guessed"
            : "unknown";
    const file = result.id + ".json";
    await writeFile(
      join(output, "data", file),
      JSON.stringify(result.raw, null, 2),
    );
    const metadata = {
      type: "REA Finding",
      title: result.tool,
      tags: [tag],
      sources: [{ resource: "../data/" + file }],
      rea_evidence_id: result.evidence?.evidence_id ?? null,
      rea_confidence: confidence ?? null,
      rea_limitations: result.evidence?.limitations ?? [],
    };
    await writeFile(
      join(output, "concepts", result.id + ".md"),
      "---\n" +
        JSON.stringify(metadata) +
        "\n---\n\nThe complete original MCP result is retained in the source JSON. State is a REA extension to OKF, not a verification attestation.\n",
    );
    index.push(`- [${result.tool}](concepts/${result.id}.md)`);
  }
  await writeFile(join(output, "index.md"), index.join("\n") + "\n");
  if (policy !== undefined)
    await writeFile(
      join(output, "policy.json"),
      JSON.stringify(policy, null, 2),
      { mode: 0o600 },
    );
  return {
    output,
    concepts: results.length,
    okf_version: "0.2",
    policy_exported: policy !== undefined,
  };
}
