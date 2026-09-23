<!-- Mirrors the ~/.claude memory file merge-gate-must-read-exit-code.md; kept in sync so any agent can read it from the repo. -->

---
name: merge-gate-must-read-exit-code
description: "FEEDBACK — I merged PR #54 past a RED verify because `gh pr checks --watch | tail` returns tail's exit code; gate a merge on the watch's own status, never on a pipeline"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 5faff77b-b24e-4aac-ba3b-7a9ff5838e27
  modified: 2026-09-22T15:34:02.963Z
---

On 2026-09-22 a background watcher did `gh pr checks 54 --watch --fail-fast | tail -7 && gh pr merge 54`.
The functions emulator test was red (a hard-coded score from the old weights), `--watch`
exited non-zero — and `tail` exited zero, so the `&&` fired and the PR merged. Dev's
verify job went red, the staging deploy skipped at verify, and the dev host quietly kept
serving the previous commit while my report would have said "merged".

**Why:** a pipeline's exit status is its LAST command's unless `set -o pipefail`. Every
"wait, then merge" chain I write for Josh's dev-merge preference is exactly this shape,
so the trap is structural, not a one-off.

**How to apply:** gate the merge on the watch itself — `if gh pr checks N --watch
--fail-fast >log; then gh pr merge …; else report the failure; fi` — or `set -o pipefail`
before any pipe whose status decides an action. Print the checks table only AFTER the
decision. And when a functions-side constant changes (weights, caps, sentences), grep
`tests/functions/` for the literal too: the unit tests run locally, the emulator tests
only in CI. See [[merge-into-dev-without-asking]] and [[image-moderation-ranking]].
