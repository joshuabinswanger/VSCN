<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/community-prototype-state.md — kept in sync so any Claude instance can read it without access to the user profile. -->

---
name: community-prototype-state
description: "The /proto/community visual prototype is merged to local dev but unpushed, and the tag-rail treatment is the one decision blocking it"
metadata: 
  node_type: memory
  type: project
  originSessionId: e3de029c-c277-47b9-ae94-97cbb49d35ac
  modified: 2026-08-20T15:08:21.948Z
---

As of 2026-08-20 the community-page visual prototype is **merged into local `dev`
and deliberately not pushed** — Josh gates the push himself and will do it when
satisfied. `origin/dev` and `main` both still sit at `10a7eba`/`44ff1e3`, so the
19 commits exist only on his machine.

Do not re-derive any of this from scratch: the design decisions, the deliberate
out-of-scope list and a numbered graduation path all live in the committed
`documentation/20260820-community-prototype-plan.md`, and the repo's
architecture facts are in the committed `CLAUDE.md`.

**The one blocking decision: the vertical tag rail.** Josh asked twice about it
and never answered. It stopped being cosmetic — taking the rail out of the card's
height calculation (so captions sit flush) means long rails now clip mid-glyph on
roughly 16 of 24 mobile cards, leaving a box stub that reads as a rendering
fault. On four cards only one of three tags fits. Pure CSS cannot hide a
partially-visible flex item, so this mechanism can only clip mid-box. The
recommendation on record: keep the vertical rail, show two tags on mobile, cap
tag length around ten characters — and fix the `--rail-w` hand-duplication first
or the reserved strip silently desynchronises.

Two things not derivable from the repo:

- **His gallery + member-type work (commit `3fcc0ba`, ~840 lines) rode along on
  the prototype branch and was never reviewed.** It is build-verified only. The
  two features were interleaved inside five files, so they could not be split
  into separate commits — that history is now permanently one commit. See
  [[scientists-as-member-type]] and [[vscn-gallery-tech-stack]].
- **Why the plan's verification gates carry explicit "what this can and cannot
  prove" caveats.** Four gates written for this build were structurally
  incapable of failing, and every one was caught by an implementer or reviewer
  rather than by me. A visibly clipped card also shipped past three programmatic
  gates and was caught only by looking at a screenshot. If those caveats look
  like over-explaining, they are not — they are the record of a real failure mode.

Ephemeral, and gone once cleared: the full execution record — 24 rulings with
their cost-if-wrong, 14 deferred minors, six task reports and the screenshots —
is at `.superpowers/sdd/20260820-community-prototype-plan/`, which is **not in
git**. Josh asked to keep it until he makes the tag call.
