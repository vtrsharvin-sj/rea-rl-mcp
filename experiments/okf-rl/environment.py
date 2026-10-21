"""Gymnasium environment over authenticated REA collections, with no target execution."""
import json
from pathlib import Path
import subprocess

import gymnasium as gym
import numpy as np
from gymnasium import spaces


def bridge(command, path, node="node", *arguments):
    root = Path(__file__).resolve().parents[2]
    result = subprocess.run(
        [node, "--import", "tsx", str(Path(__file__).with_name("bridge.ts")),
         command, str(Path(path).resolve()), *arguments],
        cwd=root, capture_output=True, text=True, encoding="utf-8", timeout=120,
        check=True, shell=False,
    )
    return json.loads(result.stdout)


def load_collection(path, node="node"):
    return bridge("verify", path, node)


class ReaOkfEnv(gym.Env):
    """Each action reveals a recorded result. Goals require declared Evidence predicates.

    Observations: per-goal state (unknown=0, inferred=1, derived=2, observed=3),
    per-action visited bits, steps used. Goal values are witnesses for bounded
    predicates, not claims that an application is completely understood.
    """
    metadata = {"render_modes": []}

    def __init__(self, collection, node="node"):
        super().__init__()
        self.node = node
        self._configure(load_collection(collection, node))

    def _configure(self, data):
        self.data = data
        self.actions = self.data["actions"]
        self.goal_count = len(self.data["goals"])
        self.max_steps = self.data["max_steps"]
        self.action_space = spaces.Discrete(len(self.actions))
        self.observation_space = spaces.MultiDiscrete(
            [4] * self.goal_count + [2] * len(self.actions) + [self.max_steps + 1]
        )
        self.ended = True

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        self.states = np.zeros(self.goal_count, dtype=np.int64)
        self.visited = np.zeros(len(self.actions), dtype=np.int64)
        self.steps = 0
        self.ended = False
        self.trace = []
        self.live_records = []
        self.goal_sources = [None] * self.goal_count
        return self._observation(), {"mode": self.data["mode"]}

    def _observation(self):
        return np.concatenate((self.states, self.visited, [self.steps])).astype(np.int64)

    def step(self, action):
        if self.ended:
            raise RuntimeError("Call reset() before stepping a finished episode")
        if not self.action_space.contains(action):
            raise ValueError("Action is outside the declared catalog")
        action = int(action)
        record = self._action_result(action)
        solved_before = self.states >= 2
        for n, value in enumerate(record["goals"]):
            if value > self.states[n]:
                self.goal_sources[n] = record["evidence_id"]
        self.states = np.maximum(self.states, np.asarray(record["goals"], dtype=np.int64))
        newly_solved = int(np.count_nonzero((self.states >= 2) & ~solved_before))
        self.visited[action] = 1
        self.steps += 1
        reward = 10.0 * newly_solved - 0.1 - (1.0 if record["error"] else 0.0)
        terminated = bool(np.all(self.states >= 2))
        truncated = self.steps >= self.max_steps and not terminated
        self.ended = terminated or truncated
        info = {"action_id": record["id"], "evidence_id": record["evidence_id"],
                "newly_solved": newly_solved, "error": record["error"],
                "limitations": record["limitations"], "mode": self.data["mode"]}
        self.trace.append({**info, "reward": reward})
        return self._observation(), reward, terminated, truncated, info

    def _action_result(self, action):
        return self.actions[action]

    def export_okf(self, destination):
        """Explicit export; reset and training never write bundles automatically."""
        destination = Path(destination)
        destination.mkdir(exist_ok=False)
        (destination / "goals").mkdir()
        tags = ["unknown", "guessed", "derived", "seen"]
        index = ['---', 'okf_version: "0.2"', '---', '', '# REA episode goals', '']
        for n, goal in enumerate(self.data["goals"]):
            sources = ([{"resource": "urn:rea:evidence:" + self.goal_sources[n]}]
                       if self.goal_sources[n] else [])
            metadata = {"type": "REA Goal", "title": goal["title"],
                        "tags": [tags[int(self.states[n])]], "sources": sources,
                        "rea_manifest_sha256": self.data["manifest_sha256"],
                        "rea_satisfied": bool(self.states[n] >= 2)}
            # JSON object syntax is a subset of YAML; arbitrary titles remain escaped.
            (destination / "goals" / (goal["id"] + ".md")).write_text(
                "---\n" + json.dumps(metadata, ensure_ascii=False) +
                "\n---\n\nState derived from the selected Evidence predicates, not editable tags.\n",
                encoding="utf-8")
            index.append(f'- [{goal["id"]}](goals/{goal["id"]}.md)')
        (destination / "index.md").write_text("\n".join(index) + "\n", encoding="utf-8")
        (destination / "episode.json").write_text(json.dumps(self.trace, indent=2), encoding="utf-8")
        if self.live_records:
            (destination / "live-evidence.json").write_text(json.dumps(self.live_records, indent=2), encoding="utf-8")
            if any(r.get("evidence", {}).get("operation") == "generate_frontend"
                   for r in self.live_records if r.get("evidence")):
                bridge("export-frontends", destination / "live-evidence.json", self.node,
                       str((destination / "frontends").resolve()))


class LiveReaOkfEnv(ReaOkfEnv):
    """Run each selected action through REA's existing offline services.

    This mode reads local binaries/PNGs/Evidence; it does not run the target app.
    Every step pins the manifest digest. Changing task goals or paths requires a
    new environment. Source artifacts may change; each result keeps its own ID.
    """
    def __init__(self, manifest, node="node"):
        gym.Env.__init__(self)
        self.manifest = str(Path(manifest).resolve())
        self.node = node
        self._configure(bridge("describe", self.manifest, node))

    def _action_result(self, action):
        result = bridge("act", self.manifest, self.node,
                        self.actions[action]["id"], self.data["manifest_sha256"])
        self.actions[action] = result["actions"][0]
        self.live_records.append(result["record"])
        return self.actions[action]
