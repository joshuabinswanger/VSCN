<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/preview-tool-ignores-worktree-launch-json.md — kept in sync so any Claude instance can read it without the user profile. -->

---
name: preview-tool-ignores-worktree-launch-json
description: The Browser pane's preview_start reads .claude/launch.json from the MAIN checkout (repo/), not the worktree you are in; verifying a worktree needs its own port and a URL-opened tab
metadata:
  type: project
---

`preview_start({name})` resolves names against `D:\SynoDrive\VSCN\repo\.claude\launch.json`,
not the worktree's copy. Adding a config to `wt-*/.claude/launch.json` is invisible to it
("No server named ... found"), and port 4321 is usually held by the main checkout's dev
server anyway (2026-09-07: another node.exe owned it; left alone, it was not mine to kill).

**Why:** the pane is bound to the session's primary directory, and a worktree only changes
the shell cwd. A worktree is a second Astro project that needs a second port.

**How to apply:** from the worktree run `npx astro dev --port 4323 --host 127.0.0.1` via
Bash `run_in_background` (log to the scratchpad), then `preview_start({url:
"http://127.0.0.1:4323/..."})`. Kill it by port afterwards (`netstat -ano | grep :4323`,
`taskkill //F //PID <pid> //T`). Do not edit the tracked launch.json to add a worktree
entry; revert if you did. Related: [[deploy-dev-needs-development-mode]],
[[browser-pane-frozen-timeline]].

Also learned the same day: `/signup` on dev is a 301 to `/onboarding`, so the sign-up
error path lives in OnboardingForm.astro, not AuthForm.astro (which is login-only now).
The prod screenshot with "Sign Up / Already have one? Log In" is the OLD AuthForm — prod
serves the pre-onboarding sign-up until the next release.
