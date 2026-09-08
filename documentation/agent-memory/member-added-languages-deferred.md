<!-- Mirrors the ~/.claude memory file `member-added-languages-deferred.md`; keep both copies in sync. -->

---
name: member-added-languages-deferred
description: "DESIGNED, NOT BUILT (2026-09-08): letting members add a working language needs a backend resolver, because validLanguages is a closed set whose hasOnly failure kills the whole profile save silently"
metadata: 
  node_type: memory
  type: project
  originSessionId: b6100d1c-0227-4a19-aca6-c3dc83b528c6
  modified: 2026-09-08T11:02:44.276Z
---

Josh asked for member-added languages on 2026-09-08, then deferred it: "write this as a work
to do in the future! for now just add italian". Full design in
`documentation/20260908-member-added-languages.md` on `feat/tag-selector-density`.

**Why:** the obvious version is a trap. `validLanguages()` in `firestore.rules` is
`hasOnly(['de','en','fr','it'])`, so the first profile carrying an unlisted language has its
**entire save rejected** with no error naming the field — the `hasOnly` trap
([[firestore-rules-hasonly-gotcha]]). The design that survives it resolves the typed name in a
callable via `Intl.DisplayNames` (built into Node, no translation table): "Spanish",
"spanisch" and "Español" all resolve to `es`, unresolvable input is rejected, and the profile
goes on storing codes. That keeps `validLanguages` a real rule, lets the member page print
localized full names instead of "DE, EN", and prevents duplicate spellings.

**How to apply:**
- Deploy order is load-bearing and is the reason this needs its own session: rules → functions
  → hosting. Step 1 alone is backwards-compatible; shipping hosting first breaks Save for
  anyone who uses the new field.
- Italian was NEVER missing — `LANGUAGES` has always been `["de","en","fr","it"]`. It looked
  missing only in the throwaway `/proto/tag-selector` harness, which hardcoded three. Do not
  "fix" the real form.
- Onboarding collects no languages at all; the field is profile-editor-only.
- A new selector inherits `.optchip` from `global.css` and needs no styling —
  see [[profile-optchip-unification]].
