import { build } from "esbuild";
import { chmod } from "node:fs/promises";
await build({
  entryPoints: ["src/cli.ts"],
  outfile: "dist/cli.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  banner: { js: "#!/usr/bin/env node" },
  sourcemap: true,
});
await chmod("dist/cli.mjs", 0o755);
