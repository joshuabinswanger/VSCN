> Mirrors the user's memory note `~/.claude/projects/D--SynoDrive-VSCN/memory/rules-evaluation-budget.md`; keep both copies in sync.

**2026-09-03. A profile save is refused when the write becomes too EXPENSIVE to judge, and
that refusal is indistinguishable from every other one.** `validGallery` unrolls a call to
`validGalleryItem` per slot; with the thorough version of that function, a realistic profile
(name, bio, role, affiliation, avatar, languages, tags, audiences, items carrying caption +
both descriptions + a link) could save **one** image. Not the ninth — the second.

**Why:** the `(!('x' in item) || (item.x is string && item.x.size() <= N))` form costs three
expressions per optional field, and there were nine fields, evaluated eight times over.
Nothing in the error says so: it is the same `Missing or insufficient permissions.` a wrong
field gives, which is why it hid behind [[firestore-rules-hasonly-gotcha]] for so long.

**How to apply:** when a save is refused, rule out the allowlists, the deployed ruleset and
the `email_verified` claim — and then ask whether the write is simply too big. Bisect by
array LENGTH, not by content: if a copy of a known-good element fails in slot 3, it is the
budget. `return item is map;` in place of the real check is the one-line confirmation.

**MEASURE AGAINST A MAXIMAL PROFILE, NOT A REALISTIC ONE.** The first fix was verified
against a fixture with three tags and two audiences, called 8/8, and was wrong: a member
with every list full still got FOUR. The member whose profile is most complete loses the
most images. What closed it was flattening the last two unrolled list validators —
`validLanguages` and `validPrimaryAudiences` — to `hasOnly` on the list, one expression
instead of one function call per element.

**The private doc is the tighter of the two.** `users/{uid}` carries three more fields than
`publicProfiles/{uid}` and paid for them out of the same budget, so it refused an eighth
image the public doc had just accepted — and `updateUserProfile` writes both. Anything added
to `validPublicFields` or `validPrivateUser` now comes out of the gallery's allowance,
silently.

What `validGalleryItem` keeps: `hasOnly`, `validStorageUrl`, and the 200-char `link` cap
(`link` has no `images/{imageId}` field behind it, so that is its only door). What moved to
`validImage` on the record: the text lengths, the colour format, the width/height ranges.
See [[gallery-uploader-reconciled]] and `documentation/20260903-gallery-rules-budget.md`.

The regression test is **"publicProfiles: a FULL profile saves a FULL gallery"** and its
fixture is deliberately maximal — a slimmer one passes while the real thing fails.
