# The wizard's closing steps, and the flat wizard

**2026-09-08.** Five notes from Josh, taken together because they touch the same screens:
"disclaimer when inactive, step in onboarding, very tall images should get a max height in
grid view, restyle onboarding, white boxes are obsolete". Clarified in conversation: the step
is two steps — "the verify step and a step where you can set your account active"; the white
boxes are the wizard's sheet and the selectors' white chips; the tall-image problem is on the
phone. Branch `feat/onboarding-visibility`, off `dev` at `38e5814`.

## What changed

### Two new wizard steps

The wizard ends `… gallery → verify (6) → visibility (7) → done (8)`. Both new steps live in
`src/components/OnboardingForm.astro`.

- **Verify (6)** is `/verify-email` inside the wizard: the address, "I've verified — continue"
  (a `reload()` paired with `hasVerifiedClaim`, the same pairing as the standalone page and
  `/auth/action`, so the token is settled before anything writes on it), a resend with the
  30-second cooldown, and "Verify later". It is placed after the gallery so the mail has the
  whole wizard to arrive. A verified account never sees it, and `setStep` leaves it out of
  the count for them — the bar says "Step 1 of 6" for a verified account and "of 7" for an
  unverified one. The amber banner above the wizard hides on this step only.
- **Visibility (7)** is the one deliberate act: "Show my profile in the community directory",
  ticked by default. Finish writes it with `setProfileActive`. For an unverified account the
  box is disabled and unticked, with a note that the profile stays hidden until verification
  and a button back to step 6; nothing is written for them (the draft is already
  `active: false`, and `canPublish` would refuse `true`).

**The bridge no longer publishes anyone.** Since 2026-05-20 both bridge buttons wrote
`active: true`, so a member was in the directory from step 2 on whatever they did next, and
Finish re-wrote it after `publishCurrentUserProfile` had cleared it. Both writes are gone;
the visibility step is the only place onboarding sets the flag. Consequence, accepted by
Josh: a member who abandons the wizard after the basics stays hidden until they finish or
verify. Verifying by email still activates an existing profile (`activatePublicProfileIfExists`
in the verify page and the action page), unchanged.

### The disclaimer tells the truth

The Done step's note used to say "may take a moment to appear" to everyone. It now says one of
three things, chosen from what the finishing write actually did: listed (the old sentence),
hidden by choice (with the way to the Account tab), or hidden until verified. A refused
`setProfileActive` counts as hidden, whatever the box said.

`/profile` gets the same honesty in `ProfileForm.astro`: a verified account whose public
profile is inactive sees a quiet bordered banner above the tabs with a button that opens the
Account tab and focuses the box; an unverified account's existing amber banner grows the
sentence "Until then your profile is hidden from the directory." Re-synced after every Save.

### White boxes gone, wizard restyled

- The white rounded sheet around the wizard (≥560px) and around `/verify-email` is removed;
  both sit flat on the page ground at the editor's 560px measure, padding 0 on desktop.
- `background: #fff` → `transparent` on the member-type options, the open-to and visual-needs
  chips, the tag suggestion chips and the tag groups. Selected states keep their dark fill.
  Inputs and buttons keep white, as they do in the editor (Josh chose "sheet + chips", not
  "site-wide").
- The progress bar is a 2px hairline in `--color-border` with the dark part travelled, and the
  label is the editor's tab voice — uppercase, spaced, muted — reading "Step n of total"
  (`onboarding.progress`, both locales). Field spacing 3rem → 2rem, the editor's rhythm.
- `.ob-done-disclaimer` became `.ob-notice`, shared by the Done step and the locked note.

### Tall images on the phone wall

Desktop caps a wall tile at 1.5 × its width by shadowing `--cgrid-row` on the cell. The phone's
two-column multicol had no row unit, so `--frame-cap` fell to its no-cap fallback and a 1:3
upload ran the full column width and three columns tall. Now (`CommunityGrid.astro`, phone
block) the wall cell is an inline-size container and states
`--cgrid-row: calc((1.5 * 100cqw + 1.2rem) / var(--slot-rows, 1))`; `CommunityWorkCard.astro`
restores the width formula for `.cgrid[data-pattern="grid"] .cgrid__cell > .cwork` inside its
mobile block, beating the `width: 100%` that the gallery view still needs (its cells carry
`--slot-rows` from the deal but no row unit, and the formula there would collapse a tile to the
2rem fallback). Verified in the browser at 375px: a forced 1:3 tile measures 249px tall in a
166px column — exactly 1.5 × — at half width, centred; untouched tiles are unchanged.

## Verified

`npm run lint` clean, `npm run build` 71 pages. Browser at 1280px: steps 0, 6, 7 and 8 forced
visible, flat wizard, transparent chips, hairline progress. Browser at 375px: the cap above.
**Not exercised signed in:** the real path through steps 6 and 7 against Firebase (account
creation is off-limits to the agent), and the `/profile` hidden banner. Both are gated by the
same rules as before; the writes are `setProfileActive`, which the editor already uses.
