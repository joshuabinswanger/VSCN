> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/tag-filter-split-and-profile-load-watchdog.md` memory file; keep the two in sync.

---
name: tag-filter-split-and-profile-load-watchdog
description: "2026-09-09 — TagSelector got a separate \"Find a tag…\" filter and instant chips; /profile got a 15 s load watchdog with Retry. SHIPPED TO PROD 2026-09-09 as merge `3de3f2b` (PR #18), after the iPhone check on dev. Registry read is still not retried after an offline episode."
metadata: 
  node_type: memory
  type: project
  originSessionId: bb772772-8787-47de-8fdf-2fa11b80f6a2
  modified: 2026-09-09T13:50:39.631Z
---

On 2026-09-09 Josh said the tag box on the Work tab "is actually a search" and
that a tag "takes a second until it lands", and that /profile on his iPhone
sometimes sits on "Loading profile…" until he reloads. Both fixed in the
working tree of `dev` (TagSelector.astro, ProfileForm.astro, translations.ts),
committed as `dc53684` (+ `828d035` sizing the filter like the add row), deployed to dev, iPhone-checked by Josh, and merged to main as PR #18 (`3de3f2b`) the same day; the prod hosting workflow deployed it.

- TagSelector now has TWO fields: `.ts-filter` ("Find a tag…") only narrows the
  three groups and forces them open while it has matches (open state restored
  when cleared; Enter picks the sole remaining chip); `.ts-input` ("Add a custom
  tag…") only creates, no inline autocomplete, `canonical()` silently takes the
  registry's spelling ("3d" → "3D"). The chip is drawn BEFORE the registry
  write; `getOrCreateTag` is fire-and-forget.
- ProfileForm: `runLoad()` races `loadProfile()` against 15 s; failure shows
  "Your profile could not be loaded." + "Try again" (`.loading-state.is-failed`).
  First Retry re-runs in place, the second reloads; returning to a visible tab
  after a failure retries once. An auth watchdog covers requireAuth never
  answering (its button reloads).

**Why:** one box doing filter+autocomplete+create meant typing "sci" to add
your own tag got "Scientific illustration"; and the boot chain had no error
handler, so any stalled Firestore read (suspended Safari tab, slow App Check)
hung for ever.

**How to apply:** the failure path was PROVEN in Josh's Chrome: App Check mint
came back `403 turnstile` under Claude-driven Chrome, Firestore went offline,
the message appeared, Retry then loaded the profile. Two loose ends: (1) the
tag registry read (`loadRegistryOnce`) failed during that offline window and
nothing retries it until a new selector connects, so the groups stayed empty
on that page; (2) the in-app Browser pane cannot finish Turnstile at all, so
Firestore never answers there — inject `el.registryTags` to test the selector.
See [[turnstile-mobile-attestation-budget]], [[vite-optimizedeps-504-trap]].
