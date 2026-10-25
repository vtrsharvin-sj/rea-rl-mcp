# End-to-end workflow

The default MCP interface exposes the original REA tools directly, plus the additions below. Use original tools normally for their full results. The retained-result workflow below is useful for RL decisions, concise text retrieval and OKF exports; both paths share the same open target. `--compact` hides the original catalog and uses discovery instead. Native analysis does not require frontend generation.

1. Identify the user's selected target and authorized interaction scope.
2. Call `rea_discover` with relevant words and `detail:"names"`; request `detail:"schema"` for exact selected names. Do not guess upstream arguments.
3. Optionally call `rl_suggest` with the current context and available names. Example context: `{"domain":"analysis","target":"native","stage":"inventory"}`. A goal can be `{"pointer":"/format","operator":"equals","expected":"pe"}` for a selected Windows executable; the predicate is evaluated against normalized Evidence when available.
4. Call the recommended original REA tool directly with its original arguments. When exactly one pending RL decision matches that tool, the server retains its result for feedback while returning the original REA response unchanged. If multiple recommendations for the same tool are pending, use `rea_run` with the exact `name`, tool `input`, and chosen `decision_id` to bind unambiguously. Default `detail:"summary"` returns a retained `result_id`. Error results remain errors.
5. Call `rea_result` with `result_id` and a JSON Pointer into the original parsed result. Follow `next_offset` until complete when necessary. A missing pointer is distinct from JSON null.
6. If text cannot answer a visual question, call `rea_visual` with a retained result or absolute PNG path and a reason: `layout_geometry`, `diagram_structure`, `text_insufficient`, or `visual_verification`. Optional crop is `{x,y,width,height}` in original pixels. Default maximum dimension is 1280. Supported format is PNG, at most 16 million source pixels and 32 MiB encoded input.
7. Call `rl_feedback` with the decision, next context and `done`. Direct calls only bind when one matching recommendation is unambiguous. Tool failure incurs a penalty. Human ratings are optional. A predicate that passes says only that its chosen condition passed.
8. Export selected `result_ids` to a new absolute `output_dir` using `okf_export`. Add `include_policy:true` only when policy persistence is wanted.

## Reconstruct a web interface

Use this section only for a requested web interface. For native executables, use the original REA provider workflow below.

Discover REA's current browser observation tools and read their full schemas. Attach to the user-selected browser target and capture `inspect_web_page` Evidence with accessible text explicitly approved under REA's capture controls. Browser startup/attachment and capture scope are upstream operations, not implicitly performed by this wrapper.

Use `frontend_generate` with either the retained observation `result_id` or an absolute path to a **complete canonical Evidence JSON**, plus a new `output_dir`, `layout` (`document`, `sidebar`, `cards`) and `theme` (`light`, `dark`). Do not pass a summary, arbitrary DOM dump or entire MCP wrapper as the Evidence file.

For RL selection, candidates can include `frontend_generate:cards:dark` and other layout/theme combinations. Execute the recommended combination with its `decision_id`. Declare a meaningful fixed generation metric predicate when appropriate. Screenshot similarity is a separate measurement, not implied by successful generation.

Open generated `index.html`, or serve its directory using a local static server. Capture a matching viewport with your chosen browser, discover REA's image comparison tool schema, and compare against the captured reference. Record unresolved assets, geometry, and behavior. Iterations must use new directories; editing an existing generated project remains the coding agent's explicit task.

This generator is deterministic and does not call a model. A connected coding agent can extend the scaffold using its own model and tools within the user's authorization.

## Native C/C++ binaries and original REA providers

REA RL forwards the original native tools without translating them into HTML or JavaScript. The MCP transport implementation is TypeScript; the actual binary analysis is performed by the original selected REA provider.

1. Discover the schema for `binary_session`, then call it through `rea_run` with `input:{}`. Retrieve `/result/analysis_provider_candidates` with `rea_result` for full provider status. An available tool name alone does not mean its engine is installed.
2. Discover `open_binary` and pass the user's absolute target path and chosen `provider_id`, such as `ghidra`. Respect its supported platforms and target formats.
3. Discover `list_procedures`, `search_procedures` and `analyze_function` as needed. Select an exact returned function name/address. `procedure_pseudo_code` returns the original provider's decompilation; `analyze_function` adds assembly, references, calls and limitations.
4. Use RL context `{domain:"analysis",target:"native",stage:"structure"}` and real upstream tool candidates to guide the investigation. Retain or export full Evidence. Decompiled C-like text is reconstructed pseudocode, not guaranteed compilable C or original source.
5. Export findings with `okf_export`, then call `close_binary` through `rea_run` to release the analysis session.

On Windows, Ghidra requires an extracted supported Ghidra distribution and compatible full JDK. Add `GHIDRA_INSTALL_DIR` and `JAVA_HOME` to the MCP server's environment using absolute installation paths. REA RL passes those values to real REA. Run `rea-rl doctor` to see actual provider readiness and reasons. `ok:true` means the MCP connection/status query succeeded; `native_provider_available` reports whether a native engine is available before selecting a target.
