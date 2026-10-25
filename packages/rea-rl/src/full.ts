import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, Server } from "@modelcontextprotocol/server";
import { createProduct } from "./server.js";
import { ReaUpstream } from "./upstream.js";

/** Both interfaces share one official REA process and its target/session state. */
export async function createFullProduct(upstream: ReaUpstream, budget: number) {
  const product = createProduct(upstream, budget);
  const addon = new Client({ name: "rea-rl-addons", version: "0.2.1" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  try {
    await product.server.connect(serverTransport);
    await addon.connect(clientTransport);
    const official = await upstream.connect();
    const addonTools = new Set(
      (await addon.listTools()).tools.map((t) => t.name),
    );
    const addonPrompts = new Set(
      (await addon.listPrompts()).prompts.map((p) => p.name),
    );
    const addonResources = new Set(
      (await addon.listResources()).resources.map((r) => r.uri),
    );
    for (const tool of (await official.listTools()).tools) {
      if (addonTools.has(tool.name))
        throw new Error(`REA tool collision: ${tool.name}`);
    }
    const server = new Server(
      { name: "rea-rl-mcp", version: "0.2.1" },
      {
        capabilities: {
          ...official.getServerCapabilities(),
          tools: { listChanged: true },
          prompts: { listChanged: true },
          resources: {
            ...official.getServerCapabilities()?.resources,
            listChanged: true,
          },
        },
        instructions:
          (official.getInstructions() ?? "") +
          "\n\nREA RL additions: Original REA tools are available directly with their original schemas and results. Both interfaces share the same target session. Use rea_run when you want retained text summaries and OKF export. To learn from direct original tool calls, use rl_suggest and call the recommended tool normally; one unambiguous pending recommendation is linked to that call for rl_feedback. Use rea_run with decision_id if you need explicit binding or have multiple pending recommendations for the same tool. Prefer text; request rea_visual only for a concrete visual gap. Use frontend_generate only for explicitly requested web interface reconstruction. RL is local tabular guidance, not model fine-tuning.",
      },
    );
    server.setRequestHandler("tools/list", async () => ({
      tools: [
        ...(await official.listTools()).tools,
        ...(await addon.listTools()).tools,
      ],
    }));
    server.setRequestHandler("tools/call", async (request, ctx) => {
      if (addonTools.has(request.params.name))
        return addon.request(request, {
          signal: ctx.mcpReq.signal,
          timeout: 300000,
          onprogress: (progress) => {
            const token = request.params._meta?.progressToken;
            if (token !== undefined)
              void ctx.mcpReq
                .notify({
                  method: "notifications/progress",
                  params: { ...progress, progressToken: token },
                })
                .catch(() => {});
          },
        });
      const directDecision = product.policy.pendingDirectDecision(
        request.params.name,
      );
      const result = await official.request(request, {
        signal: ctx.mcpReq.signal,
        timeout: 300000,
        onprogress: (progress) => {
          const token = request.params._meta?.progressToken;
          if (token !== undefined)
            void ctx.mcpReq
              .notify({
                method: "notifications/progress",
                params: { ...progress, progressToken: token },
              })
              .catch(() => {});
        },
      });
      if (directDecision) {
        try {
          if (
            product.policy.pendingDirectDecision(request.params.name) ===
            directDecision
          )
            product.policy.bind(
              directDecision,
              request.params.name,
              product.store.add(request.params.name, result),
            );
        } catch {
          // Keep the original REA response intact if optional RL retention is full.
        }
      }
      return result;
    });
    server.setRequestHandler("prompts/list", async () => ({
      prompts: [
        ...(await official.listPrompts()).prompts,
        ...(await addon.listPrompts()).prompts,
      ],
    }));
    server.setRequestHandler("prompts/get", (request, ctx) =>
      (addonPrompts.has(request.params.name) ? addon : official).request(
        request,
        { signal: ctx.mcpReq.signal },
      ),
    );
    server.setRequestHandler("resources/list", async () => ({
      resources: [
        ...(official.getServerCapabilities()?.resources
          ? (await official.listResources()).resources
          : []),
        ...(await addon.listResources()).resources,
      ],
    }));
    server.setRequestHandler("resources/templates/list", (request) =>
      official.getServerCapabilities()?.resources
        ? official.request({
            method: request.method,
            ...(request.params ? { params: request.params } : {}),
          })
        : { resourceTemplates: [] },
    );
    server.setRequestHandler("resources/read", (request, ctx) =>
      (addonResources.has(request.params.uri) ? addon : official).request(
        request,
        { signal: ctx.mcpReq.signal },
      ),
    );
    server.setRequestHandler("completion/complete", (request, ctx) =>
      official.request(request, { signal: ctx.mcpReq.signal }),
    );
    if (official.getServerCapabilities()?.resources?.subscribe) {
      server.setRequestHandler("resources/subscribe", (request) =>
        official.request(request),
      );
      server.setRequestHandler("resources/unsubscribe", (request) =>
        official.request(request),
      );
    }
    if (official.getServerCapabilities()?.logging)
      server.setRequestHandler("logging/setLevel", (request) =>
        official.request(request),
      );
    official.fallbackNotificationHandler = (notification) =>
      server.notification(notification);
    return {
      server,
      policy: product.policy,
      close: async () => {
        await addon.close();
        await product.server.close();
        await product.close();
      },
    };
  } catch (error) {
    await addon.close();
    await product.server.close();
    await product.close();
    throw error;
  }
}
