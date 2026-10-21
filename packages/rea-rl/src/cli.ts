import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createProduct } from "./server.js";
import { createFullProduct } from "./full.js";
import { spawn } from "node:child_process";
import { ReaUpstream, reaScript } from "./upstream.js";
import { generateFrontend, writeFrontend } from "./frontend.js";
import { nativeReadiness } from "./readiness.js";

const HELP = `REA RL MCP 0.2.0

rea-rl mcp [--compact] [--rea-script ABSOLUTE_SCRIPT] [--cache-mb 64] [--policy POLICY_JSON]
rea-rl official [original REA arguments...]
rea-rl doctor [--rea-script ABSOLUTE_SCRIPT]
rea-rl generate PAGE_EVIDENCE NEW_OUTPUT_DIR [document|sidebar|cards] [light|dark]
rea-rl config

Runs locally over MCP stdio. REA supplies the reverse-engineering tools.
All official REA tools are exposed by default, alongside the RL additions.
Use --compact for the eight-tool discovery interface. Prefer text; request images for visual gaps.
`;
function options(args: string[]) {
  const result: { script: string; budget: number; policy: string | undefined } =
    { script: reaScript(), budget: 64, policy: undefined };
  for (let i = 0; i < args.length; i += 2) {
    const value = args[i + 1];
    if (!value) throw new Error("Missing option value");
    if (args[i] === "--rea-script") result.script = resolve(value);
    else if (args[i] === "--cache-mb") {
      result.budget = Number(value);
      if (
        !Number.isFinite(result.budget) ||
        result.budget < 1 ||
        result.budget > 1024
      )
        throw new Error("cache-mb must be between 1 and 1024");
    } else if (args[i] === "--policy") result.policy = resolve(value);
    else throw new Error("Unknown option: " + args[i]);
  }
  return result;
}
async function main() {
  const [command = "help", ...args] = process.argv.slice(2);
  if (command === "help" || command === "--help") {
    process.stdout.write(HELP);
    return;
  }
  if (command === "--version") {
    console.log("0.2.0");
    return;
  }
  if (command === "official") {
    const child = spawn(process.execPath, [reaScript(), ...args], {
      stdio: "inherit",
      windowsHide: true,
    });
    for (const signal of ["SIGINT", "SIGTERM"] as const)
      process.once(signal, () => child.kill(signal));
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        process.exitCode = code ?? (signal ? 1 : 0);
        resolve();
      });
    });
    return;
  }
  if (command === "config") {
    const bin = resolve(process.argv[1]!);
    console.log(
      JSON.stringify(
        {
          mcpServers: {
            "rea-rl": { command: process.execPath, args: [bin, "mcp"] },
          },
        },
        null,
        2,
      ),
    );
    return;
  }
  if (command === "generate") {
    const [input, output, layout = "document", theme = "light"] = args;
    if (!input || !output)
      throw new Error("generate needs PAGE_EVIDENCE and NEW_OUTPUT_DIR");
    const evidence = generateFrontend(
      JSON.parse(await readFile(resolve(input), "utf8")),
      { layout, theme },
    );
    await writeFrontend(evidence, resolve(output));
    console.log(
      JSON.stringify({
        output: resolve(output),
        evidence_id: evidence.evidence_id,
      }),
    );
    return;
  }
  if (command !== "mcp" && command !== "doctor")
    throw new Error("Unknown command: " + command);
  const compact = command === "mcp" && args.includes("--compact");
  const config = options(
      compact ? args.filter((arg) => arg !== "--compact") : args,
    ),
    upstream = new ReaUpstream(config.script);
  if (command === "doctor") {
    try {
      const tools = await upstream.tools();
      console.log(
        JSON.stringify({
          ok: true,
          ok_scope: "MCP connection and status query",
          node: process.version,
          rea_script: config.script,
          upstream_tools: tools.length,
          transport: "stdio",
          default_modality: "text",
          learning: "session-local Q-learning",
          ...(await nativeReadiness(upstream)),
        }),
      );
    } finally {
      await upstream.close();
    }
    return;
  }
  const product = compact
    ? createProduct(upstream, config.budget * 1024 * 1024)
    : await createFullProduct(upstream, config.budget * 1024 * 1024);
  if (config.policy) {
    try {
      product.policy.load(JSON.parse(await readFile(config.policy, "utf8")));
    } catch (error) {
      await product.close();
      await product.server.close();
      throw error;
    }
  }
  let closing: Promise<void> | undefined;
  const close = () => (closing ??= product.close());
  const protocol =
    "server" in product.server ? product.server.server : product.server;
  protocol.onclose = () => {
    void close().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      void product.server
        .close()
        .then(close)
        .catch((error) => {
          console.error(error);
          process.exitCode = 1;
        });
    });
  await product.server.connect(new StdioServerTransport());
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
