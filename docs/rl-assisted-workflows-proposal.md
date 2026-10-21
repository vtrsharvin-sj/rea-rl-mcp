# RL-assisted analysis and frontend reconstruction

**Status: production design proposal with an executable offline adapter.**

The [OKF/RL adapter](../experiments/okf-rl/README.md) now collects real results
through existing REA application services, exports Google OKF 0.2 bundles, and
provides a Gymnasium environment with a tabular Q-learning baseline. Replay is
the default; explicit live-static mode executes a chosen existing offline
operation at each step, binding the action and goal manifest by digest.
Its rewards are explicit task predicates over authenticated Evidence. It does
not collect analyst ratings or integrate a learned
policy into REA's packaged tools. Requested bundle exports persist local
artifacts; learned policy state remains scoped to a training run.

The adapter also implements `generate_frontend`: a local transformation from
authenticated, text-approved page Evidence to runnable HTML/CSS/JavaScript.
Layouts and colors are explicit design choices, while text, roles and control
states come from the capture. Generated projects are exported only to new
caller-selected directories. Original CSS, backend behavior and visual fidelity
are not established by the generation result.

This proposal explores using analyst feedback and reconstruction results to
recommend the next useful step in two REA workflows:

1. Selecting among existing analysis probes for an investigation.
2. Selecting the next step while reconstructing a website frontend from
   user-selected browser evidence.

The two workflows have different outcomes and should preserve their individual
reward signals. An analyst's judgment that a probe found useful evidence cannot
be compared numerically with a screenshot pixel difference. The initial adapter
uses separate goal predicates and a common goal-completion reward; it does not
claim those rewards are calibrated to human usefulness.

## Existing REA capabilities

REA already provides the analysis and evidence interfaces these workflows could
compose. Browser inspection and selected bundle analysis are described in
[browser observation](browser-observation.md). The same guide describes
[website reconstruction](browser-observation.md#reconstruct-a-website-interface)
using `capture_web_screenshot`, declared browser scenarios, and
`compare_web_screenshots`. Screenshot comparison returns pixel-level metrics;
it does not decide whether a page is semantically correct. The nearest design
constraints are in [tool design](tool-design.md).

The repository also has a real-task evaluation harness in
[`experiments/analysis-efficiency/agent-trial.py`](../experiments/analysis-efficiency/agent-trial.py).
It runs an explicitly scoped REA task and keeps raw transcripts outside Git;
its documented zero exit status is not a quality grade. That harness is a
starting point for evaluating analysis recommendations, but it is not an RL
training set and does not evaluate a reconstructed frontend.

## Proposed first boundary

For production, treat the learned policy as a recommendation source. It may rank actions that
the agent or analyst can already choose, but it does not call REA tools, drive a
browser, edit project files, or widen a user-selected target or action list.
Existing agent and client rules remain responsible for carrying out each step.

The source-checkout adapter's optional live-static experiment is narrower than
general tool automation: it executes only the declared local metadata readers,
PNG comparisons or Evidence reads. It cannot introduce new operation names,
shell commands, target processes or browser interactions. This experimental
execution mode does not authorize shipping automatic execution in the product.

Keep feedback in memory for the active investigation in an initial study. Do
not persist target URLs, source content, screenshots, Evidence bodies, or
learned values across sessions in that study. Cross-session learning needs a
separate decision about explicit opt-in, data minimization, retention, export,
reset, and behavior when local policy data is missing or malformed.

### Analysis recommendations

The policy may rank only existing operations that are already available for the
current target and have an approved observation boundary. Candidate operations
and their effects must be resolved from their actual provider contracts rather
than a broad label such as "read-only". REA should continue to return ordinary
Evidence and limitations; a recommendation cannot turn an inference into an
observation or hide an unavailable operation.

An explicit analyst response such as _useful_, _not useful_, or _can't tell_
could provide the primary reward for one recommendation. Do not infer reward
from tool-call count, target size, or whether an analysis returned a large
amount of data. Preserve "can't tell" as missing feedback rather than a
negative label.

### Frontend reconstruction recommendations

The policy may rank workflow steps such as inspecting a requested route,
capturing a requested state, implementing a component, or comparing the
implementation against a reference. Its state should include only the route and
state coverage requested for this reconstruction and the known outstanding
steps. It cannot expand the route, viewport, or browser actions.

When screenshots have matching dimensions and states, `changed_ratio` from
`compare_web_screenshots` could be a supporting progress signal. It is not a
standalone success label: pixel changes can reflect animation, text rendering,
or irrelevant content. A separately observed interaction result and the
analyst's final judgment should remain distinct signals. Dimension mismatches,
incomplete observations, or unaligned states provide no pixel reward.

## Learning and evaluation questions

The feedback arrives over a sequence of choices, while a final reconstruction
judgment may arrive only at the end. That makes the problem sequential; a
one-step contextual bandit would be only a baseline, not a complete solution.
Before choosing an algorithm, establish:

- Whether useful feedback can be collected at each step or only at task end.
- Which state features predict an action's value without retaining target
  content or sensitive page data.
- How delayed final feedback is assigned to earlier actions.
- Whether the existing issue- and task-based evaluations contain suitable,
  authorized examples, or whether a new real investigation set is needed.
- How to compare with fixed rules and the current agent-selected workflow on
  held-out investigations, including negative results and uncertainty.

Keep analysis and reconstruction results separate. Report task completion,
analyst-rated usefulness, screenshot metrics where applicable, additional
analysis cost, and any scope violations independently. A policy is useful only
if it improves the relevant outcome without increasing unrequested actions or
obscuring uncertainty.

## Recommended first implementation

Start with offline evaluation over explicitly selected, real task records. Use
the existing agent-trial workflow for the analysis branch, with expert review
of the returned Evidence and answer as the label. For the frontend branch,
evaluate on a user-authorized reference and its requested route/state checklist;
keep source captures and screenshots outside Git. Do not invent a synthetic
reward corpus or enable online learning before both branches have enough
reviewed examples.

Compare a candidate policy with fixed rules and the current agent-selected
workflow on held-out tasks. Keep runs and policy state scoped to one evaluation;
do not retain feedback between investigations in the first iteration. Consider
opt-in local persistence only after real evaluations establish that it improves
both workflows and a retention/reset contract has been reviewed.

## Decision required before integration

This proposal does not authorize a production capability. Before substantial
implementation for integration, REA maintainers need to decide whether the
scope fits the project, which operations and feedback signals are in bounds,
whether recommendations can ever trigger an action, and what local data may be
retained. The implementation and verification plan must cover those decisions.
See [contribution scope](../CONTRIBUTING.md#contribution-scope) and its
[fail-closed integration rule](../CONTRIBUTING.md#fail-closed-integration).
