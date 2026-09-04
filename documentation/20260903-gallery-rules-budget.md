# The gallery was never eight images

**2026-09-03.** Saving a profile came back `Missing or insufficient permissions.` as soon as
the gallery held a third image. The cause was not the newly added `link` field, not a stale
ruleset and not a stale token: **Firestore rules evaluation has a budget, and
`validGalleryItem` was too expensive to run eight times.**

## How it presented

Five of Josh's uploads on dev had landed their bytes and their `images/{imageId}` record —
`status: live`, everything correct — and then failed to join his own `gallery` array. The
editor showed them; Firestore held two.

Replaying the write as the real member, against the real dev project, with the payload
bisected:

```
✓ 2 items  [A,B]
✗ 3 items  [A,B,A]   ← the third element is a copy of a known-good one
✓ 2 items  [A,C]     ← the "new" image is fine in slot 2
✓ 1 item   [C]
✗ 3 items  [A,B,C]
✗ 4 items  [A,B,A,B]
```

The content of the third element is irrelevant. Adding one is what gets refused.

Three things were ruled out first, and all three are worth ruling out again next time:

- the deployed dev ruleset is **byte-identical** to `firestore.rules` (read back through
  `firebaserules.googleapis.com/v1/projects/{p}/releases/cloud.firestore`);
- the ID token's `email_verified` claim is `true`, so `canPublish` was not the gate;
- neither profile document carries a key outside its `hasOnly` allowlist.

Replacing the body of `validGalleryItem` with `return item is map;` let all eight through.
So: cost, not correctness.

## What it costs

Measured on the emulator, maximum gallery length that saves, against a **realistic** profile
— display name, bio, role, affiliation, location, avatar, languages, tags, audiences, and
items carrying caption + both descriptions + a link:

| per-item check | fits |
| --- | --- |
| as shipped (hasOnly, url, colour, 4 length caps, imageId, w/h ranges) | **1 / 8** |
| the same caps rewritten as `item.get('x', '').size() <= N` | 2 / 8 |
| …plus loosened type checks | 3 / 8 |
| `hasOnly` + url + the four length caps | 5 / 8 |
| `hasOnly` + url + link cap + imageId cap + w/h ints | 5 / 8 |
| `hasOnly` + url + link cap + imageId cap | 6 / 8 |
| **`hasOnly` + url + link cap** | **8 / 8** |
| no per-item check at all | 8 / 8 |

Against a nearly empty profile the shipped check fitted 4, which is why the existing tests
never saw it: every gallery test wrote a **one-item** array onto a profile holding a display
name. The budget was never approached.

The `(!('x' in item) || (item.x is string && item.x.size() <= N))` form is the expensive
one — three expressions per optional field, nine fields, eight items. `item.get('x', '')`
is cheaper but not cheap enough.

## The decision

`validGalleryItem` keeps only what protects the public site and has nowhere else to live:

- **`hasOnly`** — an unlisted key is how a withdrawn field (`projectId`, once) creeps back
  in through a stale client;
- **`validStorageUrl`** — this url is rendered on the community wall, and an off-site one
  would make the directory hotlink anywhere;
- **the 200-character `link` cap** — `link` exists only in this array. It has no
  `images/{imageId}` field behind it, so this is its only door.

Everything else **moved rather than disappeared**: caption, description and
descriptionShort lengths, the colour format and the width/height ranges are enforced by
`validImage` on `images/{imageId}` — the record that is the source of truth — and again by
the client before either write. The accepted residue is that a member hand-crafting a
request could put junk in their own card.

### The private document is the real cap

`publicProfiles/{uid}` took all eight while `users/{uid}` still refused the eighth. The
private document carries three more fields (`phone`, `wantsToContribute`,
`onboardingComplete`) and was paying for them out of the same budget, and
`updateUserProfile` writes **both**, so the tighter of the two is what a member
experiences. Those three clauses moved to the `data.get(key, default)` form.

### And then the measurement turned out to be flattering

That looked like 8/8 and was not. The fixture it was measured against had three tags and
two audiences; the member it was measured FOR had seven tags and four audiences. Against a
profile with every list at its cap:

```
users 4 / 8    publicProfiles 5 / 8     with everything above already in place
```

Four. The member whose profile is most complete is the one who loses the most images, which
is exactly backwards, and the editor reports it as "Your sign-in expired."

The remaining cost was in the two list validators that were still **unrolled**:
`validLanguages` and `validPrimaryAudiences` each spent one function call per element behind
a `size()` guard. `hasOnly` on a list asks the same question — every element is one of these
— in a single expression:

```
value is list && value.size() <= 4 && value.hasOnly(['de', 'en', 'fr', 'it'])
```

It does not notice duplicates. Neither did the unrolled form; the size cap is what bounds
the list, and the client writes it from a fixed set of checkboxes. `validLanguageCode` and
`validPrimaryAudienceValue` are gone with it.

```
users 8 / 8    publicProfiles 8 / 8     at the maximum
```

Verified end to end through the editor in a real signed-in session on dev: eight images
uploaded and saved to both documents, a reorder persisted, three removals persisted and
marked their records `pendingDeletion`.

Anything added to `validPublicFields`, `validPrivateUser` or `validGalleryItem` from here
comes out of the gallery's allowance. There is no warning; a member simply loses an image.

`tests/rules/firestore.test.mjs` carries **"users + publicProfiles: a MAXIMAL profile saves
a FULL gallery"**. Its fixture is at every cap on purpose, and the lesson of this section is
that it must stay there: a merely realistic fixture passed while real members failed.

## The real fix, not done here

The `gallery` array should not carry text at all. `caption`, `description`,
`descriptionShort` and `link` belong on `images/{imageId}`, where they are already
validated and already written by `syncGalleryText`; the array should carry only
`imageId`, `url`, `width`, `height`, `color`. Then the per-item check is cheap **and**
complete, and the budget stops being a design constraint.

That touches the build (`community.astro`, `membersBuild`), the member page, the editor's
preview and `syncGalleryText`'s status from best-effort to primary — so it was not the
unblock on the day.

## If you are here because a save is failing again

Ask in this order: is the key in **both** allowlists (`validPublicProfile` and
`validPrivateUser`) and in `toPublicProfile`? Is the deployed ruleset the one in the repo?
Is the token's `email_verified` claim true? And then — is the write simply **too big to
judge**? The last one is invisible: the error is identical to all the others.
