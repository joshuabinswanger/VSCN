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

---

## Follow-up, same day: the spam line and the cover image's words

Two more notes from Josh once the above was on dev: "add a remark to check spam in the email
verification step and already expose the image title and description and tags for the first
image upload". Branch `feat/onboarding-first-image`, off `dev` at `1b1dcf9`.

### The spam remark

`verify.spam` — "Not in your inbox? Check your spam or junk folder." — now stands under the
continue button on the wizard's verify step and on `/verify-email`, one string on both so the
two screens cannot drift. The advice was not new; it was buried inside `verify.resend.msg`,
which only appears **after** the member clicks Resend. So the one person who needed it, whose
mail had arrived and been filed as junk, had to resend an email they already had in order to
be told where to look.

### The cover image's words, in the wizard

The gallery step took the bytes and nothing else, and promised that captions and descriptions
"come later, in your profile" — so the picture that becomes the member's card arrived untitled,
undescribed and untagged, and since step 2 of the works-on-the-record design the community wall
filters by exactly those image tags.

A block under the thumbnails, hidden until an image exists, edits `gallery[0]`: caption
(labelled with the editor's own "Caption" plus its read-aloud note), description, and up to
five image tags from the same curated registry, capped at 5 like the editor's per-image
selector. `MAX_GALLERY_CAPTION` / `MAX_GALLERY_DESCRIPTION` go on the controls, because the
rulesets refuse a longer value outright.

**The first image only.** An unverified account may hold exactly one gallery image, so for most
members arriving here the first image *is* the gallery; it is also the cover, whose proportions
draw the card; and a form per image would make this step the profile editor. The German pair,
the per-image link and the order stay in the editor, and the block's note says so.

**Written on blur, through the editor's own writer.** Each field's `change` updates the
in-memory item and calls `saveGalleryRecords([gallery[0]])` — the same function `/profile`'s
Save calls for all eight — so nothing here waits on Finish, which stays a step the gallery
cannot fail on behalf of. A returned failure goes to the status line the uploader already owns.
Tags are absent rather than empty when nothing is chosen, exactly as the editor does it.

Three smaller things the change forced:

- **Both tag selectors are scoped now.** The member's own selector was reached with a bare
  `tag-selector` query, which means "the first in the document" — true only by the order the
  steps happen to be written in. There are two selectors in this form as of today, so each sits
  in an identified field (`#ob-member-tags-field`, `#ob-image-tags-field`).
- **The long description prompt became a note.** In the editor it is an aria-label on an
  unlabelled row; as a visible uppercase `.label` it rendered as a shouted sentence most of the
  form's width. New string `profile.gallery.description.label` ("Description" / "Beschreibung")
  names the field, and the long sentence keeps its job as guidance.
- **The progress placeholder is empty.** It shipped `1 / 5` and a 20% bar — the wrong format
  and the wrong count since the closing steps landed. How many steps there are is not known
  until the auth guard has run, and the wizard is `display: none` until it has, so nothing is
  ever seen unfilled.

`onboarding.step5.formats` loses its promise about captions and is now just the file types.

**Verified:** lint clean, build 71 pages, both locales rendered at 1280px and 375px with the
block forced visible — 140/600 maxlengths applied, 43 curated tags in both selectors, the image
one capped at 5 and the member one at 7, a chip click selecting into the image selector, no
horizontal overflow on the phone. **Not exercised signed in:** the actual record write, since it
needs an account. It is the editor's own call with one item.

---

## Second follow-up: three corrections from the review

Josh, on the deployed dev host: "the verify your email box should only appear once in the
profile view not during onboarding. there is also a mistake where it still says Up to 7 in the
tag selector, drop it, as there is an explanation underneath it. Put the Spam notice in the
first sentence". Branch `fix/onboarding-verify-copy`, off `dev` at `c676859`.

**The amber banner leaves the wizard.** `#ob-verify-banner` and its rules, its resend handler,
the `showVerifyBanner` flag and the line in `setStep` that placed it are all gone. It rode under
every step asking for the thing the wizard now has a whole step for, so an unverified member met
the request twice on the way there. `/profile` keeps its copy, where it is the only thing that
can ask; the resend lives on the verify step and on `/verify-email`. What survives in the
wizard's stylesheet is `.btn-resend-verify`, because the visibility step's way back to
verification wears that same quiet face.

**The tag cap is stated by the field, not by the component.** `TagSelector` printed
`profile.note.tags` — "Up to 7 tags." — as a literal while `maxTags` is a prop, so every
per-image selector (capped at 5) asserted a wrong limit, and in the wizard's cover block it sat
directly above a note saying 5. The note moved out of the component and into the two fields that
actually set 7: `#ob-member-tags-field` in the wizard and `#member-tags-field` in the editor.
The editor's gallery rows and the cover block now carry no cap claim beyond their own copy.

**The spam advice is part of the opening sentence.** On both verify screens it now closes the
paragraph that names the address, instead of standing as a quiet note under the button — which
is where a member looks only after deciding the mail never came. `verify.resend.msg` lost its
own copy of the advice with it ("We've sent a new link to your email." / "Wir haben einen neuen
Link an deine E-Mail gesendet."), since otherwise resending printed the spam sentence a second
time on the same screen.

**Verified:** lint clean, build 71 pages. In the browser, both locales: the banner is absent
from the wizard's DOM entirely, the verify step's opening paragraph carries the spam sentence
and nothing else on that step mentions spam, the member-tags field shows "Up to 7 tags." once,
and the cover block's tag field shows only its own "Up to 5" note. The built `/profile` page
still carries its verify banner and exactly one cap note.
