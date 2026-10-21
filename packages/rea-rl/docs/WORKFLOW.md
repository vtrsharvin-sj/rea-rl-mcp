# End-to-end workflow

1. Identify the user's selected target and authorized interaction scope.
2. Call `rea_discover` with relevant words and `detail:"names"`; request `detail:"schema"` for exact selected names. Do not guess upstream arguments.
3. Optionally call `rl_suggest` with the current context and available names. Example context: `{"domain":"analysis","target":"native","stage":"inventory"}`. A goal can be `{"pointer":"/format","operator":"equals","expected":"pe"}` for a selected Windows executable; the predicate is evaluated against normalized Evidence when available.
4. Call `rea_run` with the exact `name`, tool `input`, and optional `decision_id`. Default `detail:"summary"` returns a retained `result_id`. Error results remain errors.
5. Call `rea_result` with `result_id` and a JSON Pointer into the original parsed result. Follow `next_offset` until complete when necessary. A missing pointer is distinct from JSON null.
6. If text cannot answer a visual question, call `rea_visual` with a retained result or absolute PNG path and a reason: `layout_geometry`, `diagram_structure`, `text_insufficient`, or `visual_verification`. Optional crop is `{x,y,width,height}` in original pixels. Default maximum dimension is 1280. Supported format is PNG, at most 16 million source pixels and 32 MiB encoded input.
7. Call `rl_feedback` with the decision, next context and `done`. Tool failure incurs a penalty. Human ratings are optional. A predicate that passes says only that its chosen condition passed.
8. Export selected `result_ids` to a new absolute `output_dir` using `okf_export`. Add `include_policy:true` only when policy persistence is wanted.

## Reconstruct a web interface

Discover REA's current browser observation tools and read their full schemas. Attach to the user-selected browser target and capture `inspect_web_page` Evidence with accessible text explicitly approved under REA's capture controls. Browser startup/attachment and capture scope are upstream operations, not implicitly performed by this wrapper.

Use `frontend_generate` with either the retained observation `result_id` or an absolute path to a **complete canonical Evidence JSON**, plus a new `output_dir`, `layout` (`document`, `sidebar`, `cards`) and `theme` (`light`, `dark`). Do not pass a summary, arbitrary DOM dump or entire MCP wrapper as the Evidence file.

For RL selection, candidates can include `frontend_generate:cards:dark` and other layout/theme combinations. Execute the recommended combination with its `decision_id`. Declare a meaningful fixed generation metric predicate when appropriate. Screenshot similarity is a separate measurement, not implied by successful generation.

Open generated `index.html`, or serve its directory using a local static server. Capture a matching viewport with your chosen browser, discover REA's image comparison tool schema, and compare against the captured reference. Record unresolved assets, geometry, and behavior. Iterations must use new directories; editing an existing generated project remains the coding agent's explicit task.

This generator is deterministic and does not call a model. A connected coding agent can extend the scaffold using its own model and tools within the user's authorization.
