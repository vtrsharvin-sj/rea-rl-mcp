import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { unwrap, evidenceOf, record } from "../src/results.js";

test(
  "real Ghidra analyzes a selected native binary through REA RL",
  {
    skip: !process.env.REA_RL_NATIVE_TARGET,
    timeout: 300000,
  },
  async (t) => {
    const client = new Client({
      name: "native-product-integration",
      version: "1",
    });
    const bin = process.env.REA_RL_TEST_BIN;
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: bin
        ? [bin, "mcp"]
        : ["--import", "tsx", resolve("src/cli.ts"), "mcp"],
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          (v): v is [string, string] => v[1] !== undefined,
        ),
      ),
      stderr: "inherit",
    });
    let opened = false;
    const run = async (name: string, input: Record<string, unknown>) => {
      const result = await client.callTool(
        name === "list_procedures"
          ? { name: "rea_run", arguments: { name, input, detail: "full" } }
          : { name, arguments: input },
        { timeout: 240000 },
      );
      assert.ok(!result.isError, JSON.stringify(result));
      return unwrap(result);
    };
    try {
      await client.connect(transport);
      const session = await run("binary_session", {});
      const status =
        record(session) && record(session.result) ? session.result : session;
      assert.ok(
        record(status) && Array.isArray(status.analysis_provider_candidates),
      );
      assert.ok(
        status.analysis_provider_candidates.some(
          (c) =>
            record(c) &&
            record(c.provider) &&
            c.provider.id === "ghidra" &&
            record(c.availability) &&
            c.availability.status === "available",
        ),
      );
      await run("open_binary", {
        path: process.env.REA_RL_NATIVE_TARGET,
        provider_id: "ghidra",
      });
      opened = true;
      const inventory = evidenceOf(await run("list_procedures", {}));
      assert.ok(inventory && Array.isArray(inventory.normalized_result));
      const rows = inventory.normalized_result.map((row) => {
        assert.ok(record(row));
        return row;
      });
      const selected =
        rows.find(
          (row) =>
            typeof row.value === "string" &&
            /^(entry|main|wmain)$/u.test(row.value),
        ) ?? rows[0];
      assert.ok(selected && typeof selected.address === "string");
      const analysis = evidenceOf(
        await run("analyze_function", { procedure: selected.address }),
      );
      assert.ok(analysis && record(analysis.normalized_result));
      const dossier = analysis.normalized_result;
      assert.ok(
        typeof dossier.pseudocode === "string" &&
          dossier.pseudocode.trim().length > 0,
      );
      assert.ok(Array.isArray(dossier.assembly) && dossier.assembly.length > 0);
      t.diagnostic(
        `Ghidra: ${rows.length} procedures; selected ${selected.address}; ${dossier.pseudocode.length} pseudocode characters; ${dossier.assembly.length} assembly lines. Target was analyzed without executing it.`,
      );
    } finally {
      try {
        if (opened) await run("close_binary", {});
      } finally {
        await client.close();
      }
    }
  },
);
