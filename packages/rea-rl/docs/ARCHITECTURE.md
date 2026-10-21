# Architecture

```text
Claude Code / Codex / MCP client
             │ stdio
         REA RL MCP (207 original + 8 additive tools)
             ├── discovery + exact forwarding → pinned REA MCP subprocess
             ├── session result cache → summaries / pointer pages / PNG fallback
             ├── local Q-table → suggested actions / one-time feedback
             ├── observed page Evidence → static frontend + derived Evidence
             └── selected original results → OKF 0.2 + optional Q-table
```

`upstream.ts` owns the MCP subprocess and propagates cancellation. `results.ts` owns retained originals and compact representations. `policy.ts` owns pending decisions and Q-values; it resolves results through the cache rather than keeping hidden copies. `visual.ts` validates PNG dimensions before decoding and resamples only on explicit request. `frontend.ts` validates canonical REA Evidence using upstream domain contracts; the renderer does not execute target JavaScript. `okf.ts` writes source JSON and Markdown concepts into a new directory. `server.ts` owns eight MCP contracts; `cli.ts` owns stdio and process shutdown.

Build bundles the required domain contracts into the executable. Runtime calls use the separately installed pinned published REA dependency. No source checkout is required after tarball installation. No hosted service, telemetry endpoint, model API, or autonomous execution loop is included. The connected agent decides which tools to execute.

`full.ts` exposes the original tool and prompt catalogs alongside the additions. It forwards original requests to the same upstream connection used by `rea_run`; opening a target through either interface makes it available through both. Original tool schemas and direct results are preserved. An in-memory MCP connection dispatches additions through their existing validation and handlers. Cancellation and progress propagate for tool execution. Official resource and completion requests are forwarded when supported; REA 6.7.0 advertises tools, prompts and completions, with no resources capability. The product adds its workflow resource. `--compact` selects the original eight-tool interface. `official` delegates CLI arguments to the pinned REA entry point.

Learning is tabular Q-learning over coarse contexts and action names. It is not neural RL, LLM training, or a policy over arbitrary tool arguments. Captured data, policy values, and OKF knowledge are distinct. Imported policy files are validated. Result eviction can make delayed feedback unavailable; export needed data before ending a session.
