# Member-added languages — future work

**Status: NOT BUILT.** Designed 2026-09-08, deferred by Josh ("write this as a work to do in
the future"). Nothing in this note has been implemented. `LANGUAGES` is still the closed set
`["de", "en", "fr", "it"]`.

## What was asked

Let a member add a working language that is not one of the four offered — the way they can
already add a custom Open-to option or a custom tag.

## Why the obvious version is wrong

`validLanguages()` in `firestore.rules` is a **closed set**:

```
function validLanguages(value) {
  return value is list && value.size() <= 4 && value.hasOnly(['de', 'en', 'fr', 'it']);
}
```

The moment the editor writes `languages: [..., "Spanish"]`, `hasOnly` fails and the **entire
profile save is rejected** — not the field, the write. And it fails the way `hasOnly` always
fails: no error naming the field, nothing in the console, the member just finds that Save has
stopped working. This is the trap CLAUDE.md documents, and it is the single most important
constraint on the rollout order below.

Relaxing it to a free list (the way `visualNeeds` and `tags` are validated — `is list` plus a
size cap and nothing else) would work, but it costs more than it looks:

- The public member page prints languages as **uppercased codes**:
  `member.languages.map((c) => c.toUpperCase()).join(", ")` in
  `src/pages/[...lang]/members/[slug].astro`, so a profile reads "Zurich · DE, EN". A free-text
  entry lands in that line as "SPANISH".
- Preset languages are **translated** — `profile.lang.de` is "German" in English and "Deutsch"
  in German. Free text cannot be, so a German visitor sees a mix.
- Nothing normalises `"Spanish"` / `"spanish"` / `"Español"` into one value.

## The design: resolve it in the backend

Josh's question — "is there no way we could process that in the backend?" — is what makes this
work. `Intl.DisplayNames` is built into Node and every browser we target, so no translation
table has to be written or maintained.

Build a reverse map once, at module load, from the ISO 639-1 code list: for each code generate
its name in English, in German, and **in its own language**, and index all three
case-insensitively to the code. Verified against a 25-language sample on 2026-09-08:

```
Spanish   -> es      spanisch   -> es      Español -> es
Dutch     -> nl      Nederlands -> nl      Griechisch -> el
japanese  -> ja      Klingon    -> UNRESOLVED
```

So a member types the language in whatever language they think in, and the profile stores a
code. Everything downstream keeps working:

- **`validLanguages` stays a real rule.** `value is list && value.size() <= 8` and each element
  a short string — tighter than `visualNeeds` and `tags` are today, because the values are
  codes rather than prose. It stops being a closed set without becoming free text.
- **Display improves rather than degrades.** The member page can print "German, English,
  Spanish", localized to the visitor, generated from the codes at build time. The four
  `profile.lang.*` keys in `translations.ts` become unnecessary.
- **No `"Spanish"` / `"spanish"` / `"Español"` triplets** — which was the main reason Josh chose
  a shared registry over per-profile free text.
- **Junk cannot enter.** An unresolvable string is rejected at the callable, with a message,
  instead of being stored.

### The registry is a shortlist, not a vocabulary

ISO 639-1 is the vocabulary. A `languages/{code}` collection exists only so the editor can show
the four current languages plus whatever members have actually added, instead of a 184-item
dropdown. Same role the `tags` collection plays, and the same get-or-create shape.

## Shape of the work

1. **`functions/src/languages.ts`** — a `getOrCreateLanguage` callable on the `onCall` pattern
   `accounts.ts` uses: take a typed string, resolve it through the reverse map, reject what
   does not resolve, create `languages/{code}` if absent, return the code.
2. **`firestore.rules`** — rules for the new `languages` collection, and the relaxed
   `validLanguages` described above. Bump the cap from 4 to 8.
3. **`src/lib/firestore.ts`** — `LANGUAGES` stops being the closed set and becomes the seed of
   the registry; a `getLanguages()` read alongside `getTags()` / `getOpenToOptions()`.
4. **A `LanguageSelector` component** on the `OpenToSelector` pattern — preset chips from the
   registry plus an add field — replacing the fixed `LANGUAGES.map()` checkbox fieldset in
   `ProfileForm.astro`. It should use `.optchip` (see below), so it costs no new styling.
5. **Display** — `[slug].astro` and anywhere else that prints languages renders names via
   `Intl.DisplayNames` instead of `toUpperCase()`.

## Rollout order — this part is not optional

**Rules and the function deploy BEFORE the frontend.** A client that writes an unlisted
language against the old ruleset has its whole profile save rejected, silently. Deploy in this
order, and verify each on dev before the next:

1. `firestore.rules` (relaxed `validLanguages` + the `languages` collection)
2. `functions` (`getOrCreateLanguage`)
3. hosting (the selector and the display change)

Step 1 alone is backwards-compatible: the old client keeps writing the four codes, which still
validate.

## Notes

- **Onboarding does not collect languages at all** — the field exists only in the profile
  editor. Anything built here is profile-only unless a wizard step is added too.
- The chips are already `.optchip` (`src/styles/global.css`), shared with Open to, Visual needs,
  Primary audience and Tags, so a new selector inherits the drawing for free.
- Italian is **already** selectable — `LANGUAGES` has held `"it"` all along. It looked missing
  only in the throwaway `/proto/tag-selector` harness, which had hardcoded three languages;
  that harness now maps over the real constant.
