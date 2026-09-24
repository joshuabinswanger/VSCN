> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/weekly-release-train.md` memory file; keep the two in sync.

---
name: weekly-release-train
description: "DECIDED 2026-09-22, DESIGN WRITTEN, NOT BUILT: prod releases every Tuesday 07:00 Zurich from dev, PR opened Monday, held by a `hold` label; the merge deploys rules + functions + hosting and runs the drift check itself"
metadata:
  type: project
---

Josh, 2026-09-22: "we will switch to a release schedule … weekly tuesday. automate the rest."
Design: `documentation/20260922-release-train-design.md` on branch `chore/release-train`
(worktree `wt-chore-release-train`), approved in chat, awaiting Josh's read of the written spec
before the plan is written.

**What changes:** a `release-train.yml` opens the `dev → main` PR Monday and merges it Tuesday
unless it carries `hold`, then DISPATCHES the deploy workflow (a `GITHUB_TOKEN` merge never
triggers a `push` workflow). Rules already deploy from CI since PRs #64–#66 (another session, same evening, on the hosting
deployer); the prod deploy grows `functions` (own `vscn-functions-deployer` SA) and `release-check`; the
check commits its entry to `release-log.md` and tags `release/YYYY-MM-DD`. Dev merges rehearse the
same pipeline. A new keyless `vscn-functions-deployer` SA per project deploys the functions; Josh must
create it and grant the roles (`scripts/release-iam.ps1`, classifier-blocked for me). `INFOMANIAK_SMTP_PASSWORD` is on prod
since 2026-09-22 (copied dev → prod by a pipe, never shown).

**Why:** PR #48 shipped a callable through hosting only; PR #58 exists because a hand functions
deploy revoked a hand grant. Hand steps are the failure mode; the schedule removes the "is it
ready?" question. Cron is UTC: 05:00 UTC drifts to 06:00 Zurich in winter, accepted.

**How to apply:** rounds of UI work no longer each need a prod plan — they ride the next Tuesday.
The moderation release went out BY HAND as `f21a60f` on 2026-09-22 before the train existed;
the first Tuesday train is 2026-09-29, watched live; expect the IAM list to
need additions. See [[release-verification-protocol]], [[image-moderation-ranking]],
[[merge-into-dev-without-asking]].

**Ready marker (2026-09-24):** the `ready-for-release` GitHub label means Josh has cleared a merged-to-dev PR for the next prod release. The first ones labelled were #74 and #77 (the German role/bio). It's opt-IN, the reverse of the train's opt-out `hold`. When the train is built, decide whether it ships only labelled work or everything on dev.
