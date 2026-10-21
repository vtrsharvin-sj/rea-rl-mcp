/** Generate a local frontend from authenticated, text-approved REA page Evidence. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  createEvidence,
  parseEvidence,
  type Evidence,
} from "../../../src/domain/evidence.js";
import { webPageInspectionSchema } from "../../../src/domain/browserObservationSchemas.js";
import {
  renderAccessibility,
  escapeHtml as escape,
} from "./frontend-renderer.js";

export const frontendOptionsSchema = z.strictObject({
  layout: z.enum(["document", "sidebar", "cards"]).default("document"),
  theme: z.enum(["light", "dark"]).default("light"),
});
export type FrontendOptions = z.infer<typeof frontendOptionsSchema>;
const filesSchema = z.strictObject({
  "index.html": z.string(),
  "styles.css": z.string(),
  "app.js": z.string(),
});
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const app = `"use strict";
const status = document.getElementById("preview-status");
function notify(message) { status.hidden = false; status.textContent = message; }
document.querySelectorAll('input[aria-checked="mixed"]').forEach(input => { input.indeterminate = true; });
document.addEventListener("submit", event => {
  event.preventDefault();
  if (event.target.reportValidity()) notify("Form validated locally. No backend is connected to this preview.");
});
document.addEventListener("click", event => {
  const link = event.target.closest("[data-preview-link]");
  if (link) { event.preventDefault(); notify("Destination was not captured for: " + link.textContent); return; }
  const button = event.target.closest("button[data-preview-action]");
  if (!button || button.disabled) return;
  if (button.hasAttribute("aria-pressed")) {
    button.setAttribute("aria-pressed", String(button.getAttribute("aria-pressed") !== "true"));
  } else notify("Action behavior was not captured for: " + button.textContent);
});
`;

function stylesheet(options: FrontendOptions) {
  const dark = options.theme === "dark";
  return `:root{color-scheme:${options.theme};--bg:${dark ? "#151c1a" : "#f6f8f5"};--surface:${dark ? "#202c26" : "#ffffff"};--ink:${dark ? "#edf3ee" : "#202b24"};--muted:${dark ? "#b3c1b6" : "#657269"};--line:${dark ? "#3e5044" : "#dce5dd"};--accent:${dark ? "#98d6ad" : "#276447"}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}.page{max-width:1180px;margin:auto;padding:48px 32px}h1,h2,h3{line-height:1.2;letter-spacing:-.025em}h1{font-size:clamp(2rem,4vw,3rem)}h2{font-size:1.7rem}p{max-width:75ch}section,article,form,nav{margin:0 0 24px}a,.link{color:var(--accent)}nav{display:flex;gap:16px;flex-wrap:wrap}ul,ol{padding-left:24px}li{margin:8px 0}button,input,textarea,select{font:inherit}button{border:0;border-radius:8px;background:var(--accent);color:${dark ? "#12291c" : "#fff"};padding:10px 18px;cursor:pointer;margin:4px 8px 4px 0}button[aria-pressed=true]{outline:3px solid var(--muted)}button:disabled,input:disabled{opacity:.55;cursor:not-allowed}label{display:block;font-weight:600;margin:16px 0 6px}input:not([type=checkbox]):not([type=radio]),textarea,select{display:block;width:min(100%,560px);padding:10px 12px;border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--ink)}.check{display:flex;align-items:center;gap:9px;font-weight:400}.image-placeholder{min-height:120px;display:grid;place-items:center;border:1px dashed var(--line);color:var(--muted);padding:20px}table{border-collapse:collapse;width:100%;overflow-wrap:anywhere}th,td{border:1px solid var(--line);padding:10px;text-align:left}.preview-status{padding:12px 16px;background:var(--surface);border:1px solid var(--line);border-radius:8px}input:focus-visible,button:focus-visible,a:focus-visible,select:focus-visible{outline:3px solid var(--accent);outline-offset:3px}details{padding:12px;border:1px solid var(--line);border-radius:8px}summary{cursor:pointer}
${options.layout === "cards" ? ".page section,.page article,.page form{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:24px}.page ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;list-style:none;padding:0}.page li{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:18px}" : ""}
${options.layout === "sidebar" ? "@media(min-width:850px){.primary-nav{position:sticky;top:24px;float:left;width:220px;flex-direction:column;padding:20px;background:var(--surface);border:1px solid var(--line);border-radius:12px}.page:has(.primary-nav)>main{margin-left:260px}}" : ""}
@media(max-width:600px){.page{padding:24px 18px}nav{gap:12px}table{font-size:14px}button{max-width:100%}.page section,.page article,.page form{padding:16px}}
`;
}

export function generateFrontend(
  raw: unknown,
  rawOptions: unknown = {},
): Evidence {
  const source = parseEvidence(raw);
  if (source.operation !== "inspect_web_page")
    throw new Error("Frontend generation requires inspect_web_page Evidence");
  if (source.confidence !== "observed")
    throw new Error("Frontend generation requires observed page Evidence");
  const page = webPageInspectionSchema.parse(source.normalized_result);
  if (page.accessibility.text_capture.status !== "included")
    throw new Error(
      "Recapture with include_accessibility_text enabled; generation needs approved accessible text",
    );
  const options = frontendOptionsSchema.parse(rawOptions);
  const nodes = page.accessibility.nodes;
  const projection = renderAccessibility(nodes);
  const title = escape(page.target.title || "Reconstructed page");
  const files = {
    "index.html": `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; script-src 'self'; img-src data:; form-action 'none'; base-uri 'none'"><title>${title}</title><link rel="stylesheet" href="styles.css"><script src="app.js" defer></script></head><body><div class="page">${projection.html}<p id="preview-status" class="preview-status" role="status" aria-live="polite" hidden></p></div></body></html>\n`,
    "styles.css": stylesheet(options),
    "app.js": app,
  };
  return createEvidence(
    undefined,
    {
      id: "rea-okf-frontend",
      name: "REA OKF frontend generator",
      version: "1",
    },
    {
      operation: "generate_frontend",
      confidence: "derived",
      authority: "analyst-inference",
      parameters: { source_evidence_id: source.evidence_id, ...options },
      result: {
        kind: "frontend-project",
        version: 1,
        source_evidence_id: source.evidence_id,
        options,
        files,
        file_sha256: Object.fromEntries(
          Object.entries(files).map(([name, value]) => [name, hash(value)]),
        ),
        metrics: {
          component_count: projection.components,
          control_count: projection.controls,
          source_node_count: nodes.length,
          unresolved_count: projection.unresolved.length,
        },
        source_completeness: page.completeness.status,
        unresolved: projection.unresolved,
      },
      evidenceLinks: [source.evidence_id],
      subjectUnavailableReason:
        "Generated frontend derives from browser Evidence; no native artifact subject is claimed.",
      limitations: [
        ...new Set([
          ...source.limitations,
          ...page.limitations,
          "Generated styling and responsive layout are design choices; original CSS, geometry and assets are not recovered.",
          "Local controls work as a preview. Original backend actions, navigation destinations and unobserved interactions remain unresolved.",
          ...(projection.missingParents
            ? [
                `${projection.missingParents} accessibility nodes have missing parents and were rendered as roots.`,
              ]
            : []),
          ...(nodes.length !== page.accessibility.total_nodes
            ? [
                "Accessibility inventory count differs from supplied nodes; reconstruction is partial.",
              ]
            : []),
        ]),
      ],
    },
  );
}

export async function writeFrontend(raw: unknown, destination: string) {
  const evidence = parseEvidence(raw);
  if (evidence.operation !== "generate_frontend")
    throw new Error("Expected frontend generation Evidence");
  const result = z
    .object({
      files: filesSchema,
      file_sha256: z.record(z.string(), z.string()),
    })
    .parse(evidence.normalized_result);
  for (const [name, data] of Object.entries(result.files))
    if (hash(data) !== result.file_sha256[name])
      throw new Error(`Generated file commitment mismatch: ${name}`);
  await mkdir(destination);
  for (const [name, data] of Object.entries(result.files))
    await writeFile(join(destination, name), data);
  await writeFile(
    join(destination, "generation.json"),
    JSON.stringify(evidence, null, 2),
  );
  await writeFile(
    join(destination, "generation.md"),
    `---\n${JSON.stringify({ type: "REA Frontend", title: "Generated frontend", tags: ["derived"], sources: [{ resource: "generation.json" }], rea_evidence_id: evidence.evidence_id })}\n---\n\nOpen index.html to preview. See generation.json for source Evidence, design limitations and unresolved actions.\n`,
  );
}
