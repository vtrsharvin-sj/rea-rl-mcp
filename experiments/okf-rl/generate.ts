import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  generateFrontend,
  writeFrontend,
} from "../../packages/rea-rl/src/frontend.js";
try {
  const [input, output, layout = "document", theme = "light"] =
    process.argv.slice(2);
  if (!input || !output)
    throw new Error(
      "Usage: generate.ts PAGE_EVIDENCE NEW_OUTPUT_DIR [document|sidebar|cards] [light|dark]",
    );
  const evidence = generateFrontend(JSON.parse(await readFile(input, "utf8")), {
    layout,
    theme,
  });
  await writeFrontend(evidence, resolve(output));
  console.log(
    JSON.stringify({
      evidence_id: evidence.evidence_id,
      output: resolve(output),
      limitations: evidence.limitations,
    }),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
