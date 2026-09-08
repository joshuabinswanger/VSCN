<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/onboarding-closing-steps.md — keep both copies in sync. -->
---
name: onboarding-closing-steps
description: "feat/onboarding-visibility is BUILT, UNCOMMITTED, in the wt-feat-works-on-the-record worktree: verify + visibility steps close the wizard, the bridge no longer publishes, disclaimers tell the truth, the wizard is flat, the phone wall caps tall tiles"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5956432e-1fff-4b88-a01e-89274337786d
  modified: 2026-09-08T06:34:04.108Z
---

**State on 2026-09-08:** branch `feat/onboarding-visibility` off `dev` `38e5814`, checked out
in `D:\SynoDrive\VSCN\wt-feat-works-on-the-record` (the worktree kept its old name; its old
branch is merged). Ten files changed, lint clean, build green, **nothing committed** — Josh
did not ask for a commit. Design note `documentation/20260908-onboarding-closing-steps.md`
on the branch. Josh approved the design in chat including the one consequence he was asked
about: the bridge no longer writes `active: true`, so an abandoned wizard stays hidden.

**Why:** five terse notes ("disclaimer when inactive, step in onboarding, very tall images
should get a max height in grid view, restyle onboarding, white boxes are obsolete");
clarified by AskUserQuestion — the step is TWO steps (verify, then set-active), the white
boxes are the wizard sheet AND the selectors' white chips (not inputs/buttons), the tall
images were on the PHONE.

**How to apply:**
- The wizard's steps are now `-1, 0, 1, 2(bridge), 3, 4, 5(gallery), 6(verify), 7(visibility),
  8(done)`. `setStep` counts steps from `emailVerified` — a verified account never sees 6 and
  is not counted for it. Anything that adds a step must touch `realSteps` there.
- Onboarding writes the active flag in ONE place: Finish on step 7, via `setProfileActive`,
  and only for a verified account. Do not put `activatePublicProfile` back on the bridge.
- The phone wall's cap needs BOTH halves: the container + `--cgrid-row` on the cell in
  `CommunityGrid.astro`'s phone block, and the width formula restated for
  `.cgrid[data-pattern="grid"] .cgrid__cell > .cwork` in `CommunityWorkCard.astro`'s mobile
  block — the card's plain `.cwork { width: 100% }` there beats the formula otherwise, and it
  must stay for the gallery view, whose cells have no row unit.
- Not exercised signed in (agent cannot create accounts): the live path through steps 6–7 and
  the `/profile` hidden banner. Josh's auth pass should walk an unverified account through.
- Next: Josh reviews on the dev server (`npx astro dev --port 4323` in the worktree, the
  pane's `preview_start` ignores worktree launch.json — see
  [[preview-tool-ignores-worktree-launch-json]]), commits, `gh pr create --draft --base dev`.
- Related: [[signup-is-the-wizards-first-step]], [[profile-editor-preview-mode]],
  [[community-mobile-pattern]].
