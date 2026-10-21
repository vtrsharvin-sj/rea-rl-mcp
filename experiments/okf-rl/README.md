# REA + Google OKF + reinforcement learning

An executable source-checkout adapter for REA's real application services.
Collect explicitly selected local observations, export an OKF 0.2 bundle, and
train a Gymnasium agent to choose which observations satisfy a bounded task.
This is an exploratory implementation, outside the packaged CLI/MCP surface.

The collector invokes the same Go/Rust inspection and screenshot-comparison
services used by REA's public adapters. Its frontend generator transforms
authenticated page Evidence into runnable HTML, CSS and JavaScript.
Training defaults to replaying those captured results. An optional `--live`
mode executes the selected operation on each step. Generation creates a project
in memory; explicit exports write it into a new directory. Neither mode launches
a target or edits an existing project. Use new collections when inputs or candidate
implementations change. No held-out performance or generalization is established
by these same-task runs.

## What OKF supplies

[Google's OKF 0.2 specification](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md)
defines Markdown concepts with YAML frontmatter and optional provenance. It is
not an RL library and does not prescribe `seen`, `guessed`, or `unknown` tags.
This adapter defines those tags as a REA extension and also preserves `derived`.
It keeps REA's original confidence, Evidence ID, and limitations. It does not add
an OKF `verified` attestation merely because a tool returned successfully.

The root index uses only `okf_version` frontmatter. Concept frontmatter is a JSON
mapping, which is valid YAML and safely represents arbitrary strings. Raw
Evidence remains in `collection.json`; each concept links to that record source.

## Automatic frontend generation

Supply a complete `inspect_web_page` Evidence object captured with
`include_accessibility_text: true`. The generator validates the Evidence ID and
the browser result schema before using the observed text and semantic structure.
It runs locally without model credentials or remote uploads.

```powershell
node --import tsx experiments/okf-rl/generate.ts C:/work/page-evidence.json C:/work/new-frontend cards light
```

The new directory contains `index.html`, `styles.css`, `app.js`, complete
`generation.json` Evidence and an OKF `generation.md` concept. Open `index.html`
or serve the directory locally to preview it. Choose `document`, `sidebar` or
`cards` layout and `light` or `dark` theme. Output directories must not exist.
Keep the source Evidence input; generation records its original ID so its
observations and limitations remain traceable.

The generated frontend includes captured headings, text, navigation labels,
lists, tables, forms and controls. Native input, checkbox and select behavior
works; forms validate locally. Captured text is escaped and target scripts are
not copied. Original backend actions, uncaptured image assets and link
destinations are recorded as unresolved. The output uses inferred responsive
styles because a passive page capture does not contain the original CSS or
geometry. It is a generated implementation to refine against the reference,
not a claim of pixel or behavior equivalence.

RL can select a generation variant with an explicit action:

```json
{
  "id": "generate-cards",
  "operation": "generate_frontend",
  "path": "C:/work/page-evidence.json",
  "layout": "cards",
  "theme": "light"
}
```

Add this to a normal task manifest. A generation result has derived confidence,
`files`, `file_sha256`, `metrics`, `source_completeness`, and `unresolved` fields
under `normalized_result`. Structural goals can inspect those metrics; they do
not measure visual similarity. Use separate REA screenshot comparisons to
evaluate rendered candidates. Collection exports put projects under
`frontends/ACTION_ID/`. Live episode exports retain each selected action's last
successful project under the same path and preserve all complete step Evidence.

## Setup and commands

Use a Node version supported by the checkout (`.nvmrc` pins 24.18.0) and Python
3.11 or newer. From the repository root:

```powershell
npm ci
python -m venv experiments/okf-rl/.venv
experiments/okf-rl/.venv/Scripts/python.exe -m pip install -r experiments/okf-rl/requirements.txt

node --import tsx experiments/okf-rl/bridge.ts collect C:/work/task.json C:/work/new-collection
experiments/okf-rl/.venv/Scripts/python.exe experiments/okf-rl/train.py C:/work/new-collection/collection.json --episodes 500 --export-okf C:/work/new-episode
```

On Unix, use `.venv/bin/python` in place of `.venv/Scripts/python.exe`. Output
directories must be new and their parent must exist. Pass `--node` to `train.py`
when the supported Node executable is not first on PATH. The adapter uses the
checkout's `tsx` dependency to call the source services; a full REA build is not
required. Keep captures and output outside Git, for example in `.cache/`.

For the direct action–observation loop, pass the manifest instead of a collection:

```powershell
experiments/okf-rl/.venv/Scripts/python.exe experiments/okf-rl/train.py C:/work/task.json --live --episodes 20 --export-okf C:/work/new-live-episode
```

Each step now runs only the chosen offline operation through REA. The manifest
digest is checked on every step, so changes to actions or goals require a new
environment. Each call starts a source adapter process, which adds overhead;
replay is preferable for larger training runs. Keep input files fixed for a
study. Goals represent witnessed predicates with their original Evidence IDs,
not assertions that an externally changing artifact still has the same state.
Explicit live episode exports also retain that episode's complete Evidence.

## Task manifest

Supply real absolute paths for your binary and frontend PNGs. This example asks
for a bounded format observation and a visual comparison of a candidate against
its reference; it does not claim that either establishes a complete replica.

```json
{
  "version": 1,
  "max_steps": 4,
  "actions": [
    {
      "id": "go-metadata",
      "operation": "inspect_go_binary",
      "path": "C:/work/app.exe"
    },
    {
      "id": "rust-metadata",
      "operation": "inspect_rust_binary",
      "path": "C:/work/app.exe"
    },
    {
      "id": "candidate-a",
      "operation": "compare_web_screenshots",
      "before": "C:/work/reference.png",
      "after": "C:/work/candidate-a.png"
    },
    {
      "id": "candidate-b",
      "operation": "compare_web_screenshots",
      "before": "C:/work/reference.png",
      "after": "C:/work/candidate-b.png"
    }
  ],
  "goals": [
    {
      "id": "binary-format",
      "title": "Observe PE format",
      "actions": ["go-metadata", "rust-metadata"],
      "pointer": "/format",
      "condition": { "operator": "equals", "value": "pe" }
    },
    {
      "id": "visual-match",
      "title": "Candidate within the selected pixel threshold",
      "actions": ["candidate-a", "candidate-b"],
      "pointer": "/changed_ratio",
      "condition": { "operator": "lte", "value": 0.05 }
    }
  ]
}
```

For ELF or Mach-O targets, select the corresponding expected format. Missing Go
or Rust metadata does not prove the target was written in another language.
These readers still provide observations about the executable's format.

The `read_evidence` operation imports a complete, previously exported REA
Evidence object: `{ "id": "interaction", "operation": "read_evidence",
"path": "C:/work/interaction-evidence.json" }`. This can bring in results from
other existing tools, including frontend interaction comparisons. The adapter
authenticates the Evidence envelope and retains the producer's confidence and
limitations; it does not rerun the original action. Provide an exact predicate
on the actual result schema for the interaction outcome you want to establish.

`pointer` is a JSON Pointer relative to `normalized_result`. Conditions support
scalar `equals` and numeric `lte`. Missing fields and null are distinct; neither
passes a numeric comparison. Default accepted confidence is `observed` and
`derived`, configurable per goal. Inferred matches are recorded but cannot solve
a goal. Empty tasks, duplicate IDs, unknown actions and reserved OKF filenames
are rejected. Caller-defined goals are trusted task configuration: the policy
does not author or edit its own reward conditions.

## Learning loop and reward

`ReaOkfEnv` implements Gymnasium's `reset` and `step` interfaces. Its observation
contains each goal's state (`unknown=0`, `guessed=1`, `derived=2`, `seen=3`),
visited-action bits and steps used. This preserves which goals and actions are
involved; three aggregate tag counts would lose that information.

An action receives +10 for each newly satisfied goal, minus 0.1 per step and an
additional 1 for a recorded failure. Those weights are chosen experiment
settings, not measured human preferences. A repeated result earns no additional
goal reward. The episode terminates only when all declared goals are satisfied;
the step limit truncates an incomplete task. Reset clears episode state without
touching source files. Evidence predicates, not editable Markdown tags, determine
state and reward. Source limitations remain in every action's diagnostic output.

The included trainer uses seeded tabular Q-learning. Its final rollout is on the
same task, labeled with its replay or live-static mode. It does not train an
LLM, learn arbitrary new arguments, or establish an improvement over REA's agent.
The Gymnasium environment can also be passed to a compatible PPO implementation;
PPO and GPU dependencies are not needed for this baseline.

The collector explicitly writes the requested local bundle, and `--export-okf`
explicitly writes a final episode bundle. There is no automatic account-wide
feedback storage or upload. Full Evidence may contain local paths and captured
data, so the requested output is a local research artifact, not a public asset.
Evidence hashes check consistency with REA's content-addressed envelope; they
are not digital signatures or independent proof that an observation is true.

## Checks

```powershell
node --import tsx --test experiments/okf-rl/bridge.test.ts experiments/okf-rl/frontend.test.ts
experiments/okf-rl/.venv/Scripts/python.exe -m unittest discover -s experiments/okf-rl -p test_environment.py -v
npx tsc -p experiments/okf-rl/tsconfig.json
```

For actual browser verification, set `REA_BROWSER_EXECUTABLE` to an installed
Chrome-family browser and run
`node --import tsx --test experiments/okf-rl/frontend.browser.test.ts`.
This captures a local fixture through REA, generates its frontend, and checks
forms, labels, checked state, script loading and mobile overflow in the browser.
Set `REA_FRONTEND_TEST_OUTPUT` to a new directory to retain the generated project,
source Evidence and screenshots; otherwise temporary test files are cleaned up.

The tests exercise real REA inspection of the running Node executable and
self-comparison of a repository PNG, Evidence tampering, goal boundaries,
Gymnasium's environment checker, reward duplication, reset and truncation.
Unit fixtures are test data, not a purported real training corpus.

The local end-to-end smoke run used actual Node executable observations and a
reference PNG compared with itself. A 500-episode baseline satisfied its two
declared goals in two replay steps (return 19.8). This checks the pipeline; the
self-comparison does not measure frontend reconstruction quality.
The same two goals were also exercised through `LiveReaOkfEnv`, making actual
REA calls at each selected step and exporting their full Evidence records.

Dynamic browser execution, native decompilation sessions, original backend generation,
delayed analyst feedback, held-out evaluation and production integration remain
future work. Their authority and verification questions are tracked in the
[design proposal](../../docs/rl-assisted-workflows-proposal.md).
