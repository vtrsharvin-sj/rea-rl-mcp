# REA RL — text-first reverse engineering for AI agents

A local MCP product combining real REA analysis, targeted image fallback, local reinforcement learning, Google Open Knowledge Format export, and automatic frontend reconstruction.

**Start here: [installation, Claude Code/Codex setup, and usage](packages/rea-rl/README.md).**

## Quick start

Use Node.js 24.11+ in the 24.x line.

```sh
npm ci
cd packages/rea-rl
npm ci
npm run check
node dist/cli.mjs doctor
npm link
claude mcp add --transport stdio --scope user rea-rl -- rea-rl mcp
codex mcp add rea-rl -- rea-rl mcp
```

On Windows, `node dist/cli.mjs config` prints absolute launch paths when an MCP client cannot resolve the npm command shim.

Ask your agent to investigate a selected target using text first, retrieve only needed fields, use cropped images for concrete visual gaps, rank next actions with RL, export findings as OKF, and reconstruct approved web observations into a new frontend directory.

## Included

- **All 207 official REA tools and six original prompts**, plus eight additive MCP tools. Original schemas, provider implementations and session workflows are preserved. `rea-rl official ...` runs the original CLI; `rea-rl mcp --compact` offers the smaller discovery interface.
- **Compact text with retained originals**, explicit paging, and PNG crop/resize fallback.
- **Local tabular Q-learning** with fixed result predicates and optional human feedback. No LLM training or benchmarked quality gain is claimed.
- **Google OKF 0.2 export** with original source results, Evidence provenance and optional learned policy.
- **Frontend generation** from observed, text-approved REA page Evidence: HTML, responsive CSS, JavaScript, local controls, and generation provenance. Styles are inferred; original assets and backend behavior are not recovered automatically.
- **Installable tarball, release workflow, agent instructions, and real stdio integration checks.**

## Project map

| Path                                               | Purpose                                       |
| -------------------------------------------------- | --------------------------------------------- |
| [packages/rea-rl](packages/rea-rl/README.md)       | Shipped MCP product and CLI                   |
| [workflow](packages/rea-rl/docs/WORKFLOW.md)       | Agent investigation and frontend workflow     |
| [deployment](packages/rea-rl/docs/DEPLOYMENT.md)   | Local installation and GitHub releases        |
| [experiments/okf-rl](experiments/okf-rl/README.md) | Optional Gymnasium/Q-learning research lab    |
| [UPSTREAM_README.md](UPSTREAM_README.md)           | Original REA documentation and provider setup |
| [docs](docs/index.md)                              | Upstream architecture, contracts and guides   |

This is an independent extension of [morluto/rea](https://github.com/morluto/rea), based on REA 6.7.0. The product uses the pinned `rea-agents` runtime. The upstream source is retained for shared contracts, research and attribution. The root package is private; distribute the `rea-rl-mcp` package from `packages/rea-rl`.

Everything runs locally over MCP stdio. Your agent's model provider may receive returned content. No cloud service or npm publication is implied by a successful local build. GitHub release automation packages the product when you push to your own repository and tag a release.

MIT licensed; original REA copyright and license preserved. See [NOTICE](packages/rea-rl/NOTICE).
