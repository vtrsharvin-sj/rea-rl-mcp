import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type BrowserContext } from "playwright-core";
import { CdpBrowserProvider } from "../../src/browser/CdpBrowserProvider.js";
import {
  inspectWebPage,
  compareWebScreenshotEvidence,
} from "../../src/application/BrowserObservationService.js";
import { createWebScreenshotArtifact } from "../../src/domain/webScreenshot.js";
import { inspectWebPageInputSchema } from "../../src/domain/browserObservation.js";
import {
  generateFrontend,
  writeFrontend,
} from "../../packages/rea-rl/src/frontend.js";

async function startSite(output: string) {
  const source =
    '<!doctype html><html lang="en"><title>Project workspace</title><body><nav aria-label="Workspace"><a href="/projects">Projects</a></nav><main><h1>Project workspace</h1><p>Plan the next release.</p><form aria-label="Project settings"><label>Project name<input required></label><label><input type="checkbox" checked>Notifications</label><button>Save project</button></form></main></body></html>';
  const server = createServer(async (request, response) => {
    try {
      if (request.url === "/source") {
        response.setHeader("content-type", "text/html");
        response.end(source);
        return;
      }
      const name = request.url?.slice(1);
      if (!name || !["index.html", "styles.css", "app.js"].includes(name)) {
        response.writeHead(404).end();
        return;
      }
      response.setHeader(
        "content-type",
        name.endsWith(".css")
          ? "text/css"
          : name.endsWith(".js")
            ? "text/javascript"
            : "text/html",
      );
      response.end(await readFile(join(output, name)));
    } catch {
      response.writeHead(500).end();
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  return { server, origin };
}

async function captureSource(
  context: BrowserContext,
  provider: CdpBrowserProvider,
  profile: string,
  origin: string,
) {
  const page = context.pages()[0]!;
  await page.goto(origin + "/source");
  const reference = await page.screenshot();
  const session = await context.newCDPSession(page);
  const { targetInfo } = await session.send("Target.getTargetInfo");
  await session.detach();
  const [port] = (
    await readFile(join(profile, "DevToolsActivePort"), "utf8")
  ).split("\n");
  const inspected = await inspectWebPage(
    provider,
    inspectWebPageInputSchema.parse({
      cdp_endpoint: `http://127.0.0.1:${port}`,
      target_id: targetInfo.targetId,
      include_accessibility_text: true,
      observation_ms: 0,
    }),
    {},
  );
  assert.ok(inspected.ok, inspected.ok ? "" : inspected.error.message);
  return { page, reference, evidence: inspected.value };
}

test(
  "real browser capture -> generation -> functional desktop/mobile preview",
  { skip: !process.env.REA_BROWSER_EXECUTABLE },
  async () => {
    const parent = await mkdtemp(join(tmpdir(), "rea-frontend-browser-"));
    const output =
      process.env.REA_FRONTEND_TEST_OUTPUT ?? join(parent, "generated");
    const { server, origin } = await startSite(output);
    let context:
      | Awaited<ReturnType<typeof chromium.launchPersistentContext>>
      | undefined;
    const provider = new CdpBrowserProvider();
    try {
      context = await chromium.launchPersistentContext(
        join(parent, "profile"),
        {
          executablePath: process.env.REA_BROWSER_EXECUTABLE!,
          headless: true,
          args: ["--remote-debugging-port=0"],
        },
      );
      const { page, reference, evidence } = await captureSource(
        context,
        provider,
        join(parent, "profile"),
        origin,
      );
      await writeFrontend(
        generateFrontend(evidence, { layout: "cards", theme: "light" }),
        output,
      );
      await writeFile(
        join(output, "source-evidence.json"),
        JSON.stringify(evidence, null, 2),
      );
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(origin + "/index.html");
      const generatedScreenshot = await page.screenshot({
        path: join(output, "desktop.png"),
      });
      await writeFile(join(output, "reference.png"), reference);
      const compared = await compareWebScreenshotEvidence(provider, {
        before: createWebScreenshotArtifact(reference),
        after: createWebScreenshotArtifact(generatedScreenshot),
        channel_threshold: 0,
      });
      assert.ok(compared.ok, compared.ok ? "" : compared.error.message);
      assert.notEqual(
        (compared.value.normalized_result as { status: string }).status,
        "dimension_mismatch",
      );
      await writeFile(
        join(output, "visual-comparison.json"),
        JSON.stringify(compared.value, null, 2),
      );
      assert.equal(
        await page.getByRole("heading", { name: "Project workspace" }).count(),
        1,
      );
      assert.equal(
        await page.getByText("Project name", { exact: true }).count(),
        1,
      );
      assert.equal(
        await page.getByRole("checkbox", { name: "Notifications" }).isChecked(),
        true,
      );
      await page
        .getByRole("textbox", { name: "Project name" })
        .fill("Autumn release");
      await page.getByRole("button", { name: "Save project" }).click();
      assert.match(
        await page.locator("#preview-status").innerText(),
        /validated locally/,
      );
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page.evaluate(
          "document.documentElement.scrollWidth <= innerWidth",
        ),
        true,
      );
      await page.screenshot({
        path: join(output, "mobile.png"),
        fullPage: true,
      });
      assert.deepEqual(errors, []);
    } finally {
      await provider.close();
      await context?.close();
      await new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
      await rm(parent, { recursive: true, force: true });
    }
  },
);
