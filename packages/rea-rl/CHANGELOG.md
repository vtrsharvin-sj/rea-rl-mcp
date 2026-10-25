# Changelog

## 0.2.2 — 2026-10-25

- `rl_feedback` returns the retained result ID, including after a direct original REA tool call, so agents can retrieve or export its Evidence.
- `rea_run` retains upstream call errors for negative RL feedback. Canceled calls release their pending decision without treating cancellation as a tool failure.
- MCP and CLI version strings come from package metadata so future releases use one version source.

## 0.2.1 — 2026-10-25

- Linked an unambiguous `rl_suggest` decision to a subsequent direct original REA tool call without changing the original result.
- Kept explicit `rea_run` decision binding for multiple pending recommendations for the same tool.

## 0.2.0 — 2026-10-21

- Exposed all 207 original REA 6.7.0 tools and six original prompts alongside eight REA RL additions.
- Added the original CLI entry point through `rea-rl official` and an optional compact MCP mode.
