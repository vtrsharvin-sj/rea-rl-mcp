# REA RL MCP

A local MCP server for reverse engineering with **real REA tools**, compact text, visual fallback, local Q-learning, Google OKF export, and automatic frontend reconstruction.

Works with Claude Code, Codex, and other MCP clients over stdio. This is an independent extension of [morluto/rea](https://github.com/morluto/rea), not an official upstream release.

## Install from this repository

Use Node.js 24.11 or newer in the 24.x line (22.19+ also supported). From the repository root:

```sh
npm ci
cd packages/rea-rl
npm ci
npm run build
node dist/cli.mjs doctor
npm link
```

`doctor` starts the installed, pinned `rea-agents@6.7.0` MCP server and lists its tools. No model API key is needed by this server; your MCP client supplies the model. Specialized REA providers such as Ghidra and IDA require their own setup: see the repository's `UPSTREAM_README.md` and `docs/`.

The package is not published to npm yet. Do not use `npx rea-rl-mcp` until you publish your own release. To install a built tarball on another computer:

```sh
npm pack
npm install -g /absolute/path/rea-rl-mcp-0.1.0.tgz
rea-rl doctor
```

## Connect an agent

After `npm link` or global tarball installation:

```sh
claude mcp add --transport stdio --scope user rea-rl -- rea-rl mcp
codex mcp add rea-rl -- rea-rl mcp
```

If Windows cannot resolve the npm command shim, run `node dist/cli.mjs config` in this package and use its absolute Node/script command in your client's MCP configuration.

For Codex, equivalent `~/.codex/config.toml`:

```toml
[mcp_servers.rea-rl]
command = "rea-rl"
args = ["mcp"]
startup_timeout_sec = 30
tool_timeout_sec = 300
```

For Claude project configuration, copy [examples/mcp.json](examples/mcp.json) to `.mcp.json` in your target project. Restart the client and confirm the server appears in its MCP list.

## Ask your agent

> Use REA RL to reverse engineer this selected application. Discover only relevant tool schemas. Prefer text summaries and targeted result fields. Use images only when layout, a diagram, or visual ambiguity requires them; crop the relevant area. Preserve Evidence IDs and unknowns. Use local RL to rank next actions, fixing goal predicates before execution. Export the findings to a new OKF directory. If this is a web interface, capture approved accessible text, generate a frontend in a new directory, and compare it with the reference. Report which behavior and assets remain unobserved.

See [workflow](docs/WORKFLOW.md) for exact calls and [architecture](docs/ARCHITECTURE.md) for boundaries.

## Eight tools

| Tool                | Purpose                                                                          |
| ------------------- | -------------------------------------------------------------------------------- |
| `rea_discover`      | Search REA's live catalog; retrieve selected schemas                             |
| `rea_run`           | Execute an exact REA tool; retain full output; return compact text               |
| `rea_result`        | Retrieve a field or explicit text page by JSON Pointer                           |
| `rea_visual`        | Return a PNG with an explicit reason; optional crop and resize                   |
| `rl_suggest`        | Rank tool names or frontend variants for the current context                     |
| `rl_feedback`       | Credit one executed decision using its fixed predicate and optional human rating |
| `frontend_generate` | Produce HTML/CSS/JS from observed page Evidence                                  |
| `okf_export`        | Save selected original results, provenance, and optional policy                  |

Also exposes the `reverse_engineer` prompt and `rea-rl://workflow` resource.

## What the product does

- **Text first:** eight visible tools; demand-driven upstream schemas, compact previews and paged original results. Visual fallback requires an explicit reason. Requesting `rea_run` with `detail:"full"` deliberately returns the original content, which can include images. No measured token reduction is claimed.
- **RL:** tabular Q-learning over domain/target/stage and available action names. Reward = fixed goal predicate + optional human rating − failure penalty − 0.01 step cost; alpha 0.25, gamma 0.9. Exploration is opt-in (10%). This learns action preferences, not model weights. Quality improvements have not been established by a benchmark.
- **OKF:** Google Open Knowledge Format 0.2 Markdown concepts plus complete source JSON. Confidence tags are this product's extension, not Google's verification system. OKF stores knowledge; it does not perform training.
- **Frontend:** three layouts and two themes, responsive CSS, semantic accessible controls, local form validation and provenance. It generates an inferred scaffold from approved captured text. It does not recover original CSS, images, backend behavior, or guarantee a pixel match. Agents can use REA screenshot comparison to iterate.

## Local data and execution

The server runs on your computer and inherits REA's capabilities and provider requirements. `rea_run` can execute the effects of the selected upstream tool; review its schema and your target authorization. Target text is untrusted data. Your MCP client can send returned text/images to its model provider.

Full results are held in a session cache (64 MiB of serialized wire data by default, **not** a total memory limit). Old results are evicted explicitly. Export needed results before restarting. Writes require caller-selected new directories and refuse existing directories. OKF exports may contain target data and paths; review them before sharing. Environment variables and credentials are not exported automatically.

```sh
rea-rl mcp --cache-mb 128
rea-rl mcp --policy /absolute/path/okf/policy.json
rea-rl generate /absolute/path/page-evidence.json /absolute/path/new-preview cards dark
```

Policy persistence is opt-in via `okf_export` with `include_policy:true`. It contains action values and visit counts, not source results. Keep feedback human ratings tied to actual human input. A decision is consumed once; a failed or interrupted execution may require a new recommendation.

## Develop and release

```sh
npm run check
npm pack
```

The check covers typed contracts, real stdio discovery/execution against installed REA, feedback, exact retrieval, visual fallback, and OKF export. Frontend and browser regressions also live under `experiments/okf-rl/`. The optional Gymnasium experiment is separate from the shipped JS Q-learning implementation.

See [deployment](docs/DEPLOYMENT.md). The repository workflow produces a tested tarball and publishes it as a GitHub Release on `rea-rl-v*` tags. It does not publish to npm or deploy a hosted service. This product is a local stdio MCP server; it does not need a cloud account or expose an HTTP port.

MIT licensed. See [NOTICE](NOTICE) for upstream attribution.
