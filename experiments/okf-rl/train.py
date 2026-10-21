"""Train Q-learning over recorded or explicitly selected static REA observations."""
import argparse
import json
import random
from pathlib import Path

from environment import ReaOkfEnv, LiveReaOkfEnv


def train(env, episodes, seed):
    randomizer = random.Random(seed)
    q = {}

    def values(state):
        return q.setdefault(tuple(int(x) for x in state), [0.0] * env.action_space.n)

    def greedy(state):
        row = values(state)
        return randomizer.choice([i for i, value in enumerate(row) if value == max(row)])

    for episode in range(episodes):
        state, _ = env.reset(seed=seed if episode == 0 else None)
        epsilon = max(0.05, 0.8 * (1 - episode / episodes))
        while True:
            action = randomizer.randrange(env.action_space.n) if randomizer.random() < epsilon else greedy(state)
            next_state, reward, terminated, truncated, _ = env.step(action)
            # This task's finite step budget is part of the observation and objective.
            future = 0.0 if terminated or truncated else max(values(next_state))
            values(state)[action] += 0.3 * (reward + 0.95 * future - values(state)[action])
            state = next_state
            if terminated or truncated:
                break

    state, _ = env.reset(seed=seed)
    total = 0.0
    while True:
        state, reward, terminated, truncated, _ = env.step(greedy(state))
        total += reward
        if terminated or truncated:
            return {"mode": env.data["mode"], "episodes": episodes, "seed": seed,
                    "return": total, "goals_satisfied": terminated, "steps": env.steps,
                    "trace": env.trace, "learned_states": len(q),
                    "limitation": "Same-task evaluation only; no held-out generalization or performance improvement claim."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("collection", type=Path)
    parser.add_argument("--node", default="node")
    parser.add_argument("--episodes", type=int, default=500)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--live", action="store_true", help="Input is a manifest; run real static REA actions at each step instead of replaying a collection")
    parser.add_argument("--export-okf", type=Path)
    args = parser.parse_args()
    if args.episodes < 1:
        parser.error("--episodes must be positive")
    env = (LiveReaOkfEnv if args.live else ReaOkfEnv)(args.collection, args.node)
    try:
        report = train(env, args.episodes, args.seed)
        if args.export_okf:
            env.export_okf(args.export_okf)
        print(json.dumps(report, indent=2))
    finally:
        env.close()
