# Build and distribute

## Source build

Run `npm ci` at the repository root, then `npm ci` and `npm run check` in `packages/rea-rl`. Use Node 24. The root dependencies are needed to bundle shared domain contracts. Runtime installations only need the built tarball and its declared dependencies.

Run `npm pack` in this package. Install the resulting tarball globally on the agent's machine using `npm install -g /absolute/path/rea-rl-mcp-0.2.2.tgz`. Run `rea-rl doctor`, then configure the client as shown in the README. The server is deployed locally through the client's stdio process launcher.

## GitHub release

This product repository is `vtrsharvin-sj/rea-rl-mcp`. The root is marked private to avoid accidentally publishing the upstream package identity. The original REA workflows are preserved under `.github/upstream-workflows` as inactive reference; the active workflow verifies and distributes this product.

The `rea-rl-release.yml` workflow checks and packages on changes and supports manual runs. Push a tag `rea-rl-v0.2.2` matching the package version to create a GitHub Release containing the tarball and SHA-256 checksum. The workflow uses the built-in repository token; no model keys or npm credentials are required. Review package contents before tagging. Releases do not publish to npm.

For npm publication, first choose a package name you own, update the package and lockfile together, and configure trusted publishing or npm authentication for that identity. This repository intentionally does not enable automatic npm publication.

## Hosted services

Do not put stdio behind an HTTP proxy and assume it becomes a hosted MCP service. Remote deployment would require a transport adapter, authentication, target isolation, quotas and process ownership appropriate to that environment. This release is a local product for agent-controlled local targets.

## Checks and troubleshooting

- `rea-rl doctor` must report `ok:true` and a nonzero tool count.
- If the client cannot launch the command, use `rea-rl config` to obtain absolute executable paths. Keep the supported Node runtime in that configuration.
- If an upstream provider is unavailable, follow REA's provider setup guide. Tool presence does not establish provider readiness.
- If results expire, repeat the authorized observation or export earlier. Increase `--cache-mb` when needed.
- If generation refuses an Evidence record, check that it is complete, observed, from `inspect_web_page`, and includes approved accessible text. Do not edit evidence confidence to bypass validation.
- Run `npm run check` for the product's real stdio regression suite. The optional Python/Gymnasium lab has separate requirements under `experiments/okf-rl`.
