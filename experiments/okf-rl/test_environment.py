"""Reward/lifecycle regression tests; fixtures here are tests, never a training corpus."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from gymnasium.utils.env_checker import check_env
from environment import ReaOkfEnv
from train import train


def data():
    return {"mode": "offline-replay", "max_steps": 3, "manifest_sha256": "a" * 64,
            "goals": [{"id": "one", "title": "One"}, {"id": "two", "title": "Two"}],
            "actions": [
                {"id": "first", "goals": [3, 0], "error": None, "evidence_id": "ev_first", "limitations": []},
                {"id": "second", "goals": [0, 2], "error": None, "evidence_id": "ev_second", "limitations": []},
                {"id": "failure", "goals": [0, 0], "error": "failure", "evidence_id": None, "limitations": []},
            ]}


class EnvironmentTests(unittest.TestCase):
    def make_env(self):
        with patch("environment.load_collection", return_value=data()):
            return ReaOkfEnv("unused")

    def test_gym_contract(self):
        check_env(self.make_env(), skip_render_check=True)

    def test_rewards_are_once_per_goal_and_steps_after_end_fail(self):
        env = self.make_env()
        env.reset()
        self.assertAlmostEqual(env.step(0)[1], 9.9)
        self.assertAlmostEqual(env.step(0)[1], -0.1)
        _, reward, done, truncated, _ = env.step(1)
        self.assertAlmostEqual(reward, 9.9)
        self.assertTrue(done)
        self.assertFalse(truncated)
        with self.assertRaises(RuntimeError):
            env.step(0)
        env.reset()
        self.assertAlmostEqual(env.step(0)[1], 9.9)

    def test_failures_truncate_without_false_completion(self):
        env = self.make_env()
        env.reset()
        for _ in range(3):
            _, reward, done, truncated, _ = env.step(2)
        self.assertAlmostEqual(reward, -1.1)
        self.assertFalse(done)
        self.assertTrue(truncated)

    def test_training_and_explicit_export(self):
        env = self.make_env()
        report = train(env, 500, 42)
        self.assertTrue(report["goals_satisfied"])
        self.assertEqual(report["steps"], 2)
        with tempfile.TemporaryDirectory(prefix="rea-okf-env-") as parent:
            output = Path(parent) / "episode"
            env.export_okf(output)
            self.assertTrue((output / "goals" / "one.md").is_file())
            with self.assertRaises(FileExistsError):
                env.export_okf(output)


if __name__ == "__main__":
    unittest.main()
