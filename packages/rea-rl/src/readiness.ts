import { z } from "zod";
import type { ReaConnection } from "./upstream.js";
import { unwrap } from "./results.js";

const statusView = z.object({
  analysis_provider_candidates: z.array(
    z.object({
      provider: z.object({
        id: z.string(),
        name: z.string(),
        version: z.string().nullable(),
      }),
      availability: z.object({
        status: z.enum(["available", "unavailable", "unknown"]),
        code: z.string().nullable(),
        reason: z.string().nullable(),
      }),
    }),
  ),
});

/** Project the live upstream status; catalog presence alone does not prove readiness. */
export async function nativeReadiness(upstream: ReaConnection) {
  const raw = await upstream.call("binary_session", {});
  if (raw.isError)
    throw new Error(
      "REA native readiness failed: " + JSON.stringify(unwrap(raw)),
    );
  const body = unwrap(raw);
  const status = statusView.parse(
    typeof body === "object" && body !== null && "result" in body
      ? body.result
      : body,
  );
  return {
    native_provider_available: status.analysis_provider_candidates.some(
      (candidate) => candidate.availability.status === "available",
    ),
    native_providers: status.analysis_provider_candidates,
    scope:
      "Provider readiness only; select a target to establish its supported operations.",
  };
}
