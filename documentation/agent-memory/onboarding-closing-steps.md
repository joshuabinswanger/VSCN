<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/onboarding-closing-steps.md — keep both copies in sync. -->
---
name: onboarding-closing-steps
description: "The wizard's closing work, BOTH PARTS MERGED AND LIVE ON DEV at 0cce488: verify + visibility steps close the wizard, the bridge no longer publishes, the wizard is flat, the phone wall caps tall tiles, and the first upload gets its title, description and tags. Not on prod; the signed-in path is unwalked"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5956432e-1fff-4b88-a01e-89274337786d
  modified: 2026-09-08T06:34:04.108Z
---

**State on 2026-09-08:** merged into `dev` at `f5ae60f` (merge of `0ee16f2`, done in a
throwaway detached worktree per [[merging-into-dev-without-switching]]; `merge-tree` reported no
conflicts against the image-tags work, lint and build were run on the MERGED tree). The push
triggers the staging deploy of the dev host. The feature branch is still checked out in
`D:\SynoDrive\VSCN\wt-feat-works-on-the-record` (the worktree kept its old name) — tear it down
with `npm run worktree -- feat/onboarding-visibility --remove`. Design note
`documentation/20260908-onboarding-closing-steps.md`. Josh approved the design in chat including
the one consequence he was asked about: the bridge no longer writes `active: true`, so an
abandoned wizard stays hidden. Not yet on prod.

**Follow-up, also merged (2026-09-08):** `feat/onboarding-first-image` (`7102ef3` + the mirror
commit) merged into `dev` at `0cce488`, staging deployed and verified live on
`vscn-dev-f4b60.web.app` in both locales. Two more notes: "add a remark to check spam in the
email verification step and already expose the image title and description and tags for the
first image upload". Same design note, its "Follow-up, same day" section. Both feature branches
are now merged; the worktree `D:\SynoDrive\VSCN\wt-feat-works-on-the-record` still holds
`feat/onboarding-first-image` and can go:
`npm run worktree -- feat/onboarding-first-image --remove`.

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
- The cover image's words are written ON BLUR through `saveGalleryRecords([gallery[0]])`, the
  editor's own writer. Anything new on that step should follow the same rule: this step
  persists as it goes, and Finish must stay a step the gallery cannot fail on behalf of.
- The wizard now holds TWO `<tag-selector>` elements (member tags, cover-image tags). Query
  them through `#ob-member-tags-field` / `#ob-image-tags-field` — a bare `tag-selector` query
  silently means "the first one written in the file".
- Only `gallery[0]` gets fields in the wizard, on purpose (unverified accounts hold one image;
  it is the card's cover; a form per image would be the editor). The German pair, the per-image
  link and the order stay in `/profile`.
- The phone wall's cap needs BOTH halves: the container + `--cgrid-row` on the cell in
  `CommunityGrid.astro`'s phone block, and the width formula restated for
  `.cgrid[data-pattern="grid"] .cgrid__cell > .cwork` in `CommunityWorkCard.astro`'s mobile
  block — the card's plain `.cwork { width: 100% }` there beats the formula otherwise, and it
  must stay for the gallery view, whose cells have no row unit.
- Not exercised signed in (agent cannot create accounts): the live path through steps 6–7 and
  the `/profile` hidden banner. Josh's auth pass should walk an unverified account through.
- Next: Josh walks an unverified account through steps 6–7 AND the first upload on the dev
  host — the only unproven parts are the record write for the cover's words and the `/profile`
  hidden banner, both needing an account. Then a dev → main release PR carries it to prod with
  everything else waiting on dev.
- Related: [[signup-is-the-wizards-first-step]], [[profile-editor-preview-mode]],
  [[community-mobile-pattern]].
