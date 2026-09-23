> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/main-branch-protected.md` memory file.

---
name: main-branch-protected
description: "main is protected since 2026-09-23 — four required Actions checks, admins included, PR-only, no force-push/delete; dev is untouched"
metadata:
  node_type: memory
  type: project
  originSessionId: eb36f903-79db-4584-aa43-bd10333b4ba3
  modified: 2026-09-23T07:59:06.787Z
---

Since 2026-09-23, `main` on joshuabinswanger/VSCN has classic branch protection. Josh applied it himself, because the auto-mode classifier refused my `gh api PUT .../protection` call as a "CI Bypass".

- Required checks, all pinned to GitHub Actions (app_id 15368): `verify / verify`, `export`, `render`, `build_and_preview`. All four are required because a job skipped after an upstream failure still counts as passing.
- `enforce_admins: true`. This is the real fix for [[merge-gate-must-read-exit-code]]: `gh pr merge` on a red PR is now refused even with Josh's admin token.
- Changes need a PR (0 approvals). No force-push, no deletion. `strict: false`, because main's release merge commits never reach dev, so strict would mark every release PR out of date.
- GitGuardian is deliberately NOT required, so a third-party outage can't block releases.
- `dev` is unprotected; merging into dev by pushing `HEAD:refs/heads/dev` still works ([[merging-into-dev-without-switching]]).

**Why:** PR #54 merged past a red verify.
**How to apply:** if a PR workflow job is renamed, update the required contexts too, or every release PR hangs on a check that never reports. The [[weekly-release-train]] auto-merge will wait on these checks.
