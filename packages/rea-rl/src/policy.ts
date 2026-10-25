import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pointer, type StoredResult } from "./results.js";

export const contextSchema = z.strictObject({
  domain: z.enum(["analysis", "frontend"]),
  target: z.enum(["native", "javascript", "web", "managed", "other"]),
  stage: z.enum([
    "inventory",
    "structure",
    "behavior",
    "reconstruction",
    "verification",
  ]),
});
export const goalSchema = z
  .strictObject({
    pointer: z
      .string()
      .max(2048)
      .refine(
        (v) => (v === "" || v.startsWith("/")) && !/~(?![01])/u.test(v),
        "Invalid JSON Pointer",
      ),
    operator: z.enum(["equals", "lte"]),
    expected: z.union([
      z.string().max(4096),
      z.number().finite(),
      z.boolean(),
      z.null(),
    ]),
  })
  .refine(
    (v) => v.operator !== "lte" || typeof v.expected === "number",
    "lte requires a numeric expectation",
  );
type Context = z.infer<typeof contextSchema>;
type Goal = z.infer<typeof goalSchema>;
type Decision = {
  state: string;
  action: string;
  goal: Goal | undefined;
  resultId: string | undefined;
  executing?: boolean;
};
const policySchema = z.strictObject({
  version: z.literal(1),
  values: z.record(
    z.string(),
    z.record(
      z.string(),
      z.strictObject({
        q: z.number().finite(),
        visits: z.number().int().nonnegative(),
      }),
    ),
  ),
});
export class LearningPolicy {
  private values: z.infer<typeof policySchema>["values"] = {};
  private decisions = new Map<string, Decision>();
  constructor(private readonly resolveResult: (id: string) => StoredResult) {}
  private key(c: Context) {
    return `${c.domain}:${c.target}:${c.stage}`;
  }
  private row(state: string) {
    return this.values[state] ?? (this.values[state] = {});
  }
  suggest(
    context: Context,
    candidates: string[],
    goal: Goal | undefined,
    explore = false,
  ) {
    if (!candidates.length)
      throw new Error("Provide at least one available candidate");
    const state = this.key(context),
      row = this.row(state);
    const ranked = [...new Set(candidates)]
      .map((action) => ({
        action,
        q: row[action]?.q ?? 0,
        visits: row[action]?.visits ?? 0,
      }))
      .sort(
        (a, b) =>
          b.q - a.q || a.visits - b.visits || a.action.localeCompare(b.action),
      );
    const exploring = explore && Math.random() < 0.1;
    const selected = exploring
      ? ranked[Math.floor(Math.random() * ranked.length)]!
      : ranked[0]!;
    if (this.decisions.size >= 1024)
      throw new Error(
        "Pending decision capacity reached; complete feedback or restart the session",
      );
    const id = "decision_" + randomUUID();
    this.decisions.set(id, {
      state,
      action: selected.action,
      goal,
      resultId: undefined,
    });
    return {
      decision_id: id,
      recommended: selected.action,
      exploration: exploring,
      ranking: ranked,
      learning:
        "Local tabular Q-learning; no performance improvement is implied.",
    };
  }
  bind(id: string, action: string, result: StoredResult) {
    const decision = this.decisions.get(id);
    if (!decision) throw new Error("Decision is unknown or already completed");
    if (decision.action !== action)
      throw new Error("Executed action differs from the recommendation");
    if (decision.resultId) throw new Error("Decision already has a result");
    decision.resultId = result.id;
  }
  pendingDirectDecision(action: string) {
    const matches = [...this.decisions.entries()].filter(
      ([, decision]) =>
        decision.action === action &&
        decision.resultId === undefined &&
        !decision.executing,
    );
    return matches.length === 1 ? matches[0]![0] : undefined;
  }
  bindDirect(action: string, result: StoredResult) {
    const decisionId = this.pendingDirectDecision(action);
    if (!decisionId) return false;
    this.bind(decisionId, action, result);
    return true;
  }
  assertAction(id: string, action: string) {
    const d = this.decisions.get(id);
    if (!d || d.action !== action || d.resultId || d.executing)
      throw new Error("Invalid or already executed decision");
    d.executing = true;
  }
  feedback(
    id: string,
    next: Context,
    done: boolean,
    analystRating: number | undefined,
  ) {
    const d = this.decisions.get(id);
    if (!d || !d.resultId)
      throw new Error("Feedback requires one uncredited executed decision");
    const result = this.resolveResult(d.resultId);
    const value = d.goal
      ? pointer(
          result.evidence?.normalized_result ?? result.json,
          d.goal.pointer,
        )
      : undefined;
    const goalPassed =
      !result.raw.isError &&
      result.evidence?.confidence !== "inferred" &&
      d.goal !== undefined &&
      (d.goal.operator === "equals"
        ? value === d.goal.expected
        : typeof value === "number" &&
          typeof d.goal.expected === "number" &&
          value <= d.goal.expected);
    const rewardSignals = {
      goal: goalPassed ? 1 : 0,
      analyst: analystRating ?? 0,
      failure: result.raw.isError ? -1 : 0,
      cost: -0.01,
    };
    const reward = Object.values(rewardSignals).reduce((a, b) => a + b, 0);
    const row = this.row(d.state),
      entry = row[d.action] ?? { q: 0, visits: 0 };
    const nextRow = this.row(this.key(next));
    const future = done
      ? 0
      : Math.max(0, ...Object.values(nextRow).map((v) => v.q));
    entry.q += 0.25 * (reward + 0.9 * future - entry.q);
    entry.visits++;
    row[d.action] = entry;
    this.decisions.delete(id);
    return {
      reward,
      signals: rewardSignals,
      goal_passed: goalPassed,
      q: entry.q,
      visits: entry.visits,
      policy_scope: "session unless explicitly exported",
    };
  }
  snapshot() {
    return policySchema.parse({ version: 1, values: this.values });
  }
  load(value: unknown) {
    this.values = policySchema.parse(value).values;
  }
}
