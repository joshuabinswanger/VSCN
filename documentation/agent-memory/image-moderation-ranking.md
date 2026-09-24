> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/image-moderation-ranking.md` memory file; keep the two in sync.

---
name: image-moderation-ranking
description: SHIPPED TO PROD `f21a60f` 2026-09-22 (rules by CI, functions by hand, check GREEN) — admin ratings order both /community views; the signed-in admin walk on prod is still unwalked
metadata: 
  node_type: memory
  type: project
  originSessionId: 5faff77b-b24e-4aac-ba3b-7a9ff5838e27
  modified: 2026-09-22T16:30:00.000Z
---

Shipped to dev 2026-09-22 (PR #49, merge `22f5ab6`). Rules and the three
callables were deployed by hand afterwards — the staging pipeline is
hosting-only, so neither would have ridden along.

Admins rate a picture on aesthetics (a 0–5 slider) and answer professional /
knowledge-communication as YES or NO (stored 5 or 0 on the same scale — the
wire contract never changed; since 2026-09-22, Josh: "just on or off") plus a **computed** completeness the slider pre-fills and they may
override. Score = `0.35·aes + 0.25·prof + 0.25·know + 0.15·complete` (aesthetics moved to the top 2026-09-22 at Josh's request), averaged
across admins, 0–100. Ratings live in `imageModeration/{imageId}` — admin-read,
callable-written — **never** on `images/{id}`, because that document is
member-writable behind `validImage()`'s allowlist (see
[[firestore-rules-hasonly-gotcha]]). `validImage` was not edited and a rules
test stands guard over that.

**The trap that nearly made this decorative.** `applyLayout` in
`CommunityGrid.astro` re-deals BOTH galleries with a seeded Fisher–Yates on
every page load. A server-side sort by score therefore reached crawlers, no-JS
visitors and the JSON-LD — and no human being. The fix was not to delete the
shuffle (it is deliberate: no member permanently owns the top-left) but to band
it: equal scores form a band, bands descend by score, membership shuffles inside
each. Back-reproducibility survives. **Any future feature that tries to order
either /community gallery server-side will hit this same wall.**

**`ProfileWork` cannot carry build-only fields.** The profile editor and the
onboarding form build that interface from unsaved browser state, so a required
field there breaks `astro check` in two components. The build's own type got
`RankedWork extends ProfileWork` instead.

**`firebase deploy --only functions` fails on this machine** with "Cannot
determine backend specification. Timeout after 10000" — which this repo's own
code comments describe as a mask for an import-time crash. It was not a crash:
the module loaded fine under plain `node`. It is just slow discovery on Windows.
`FUNCTIONS_DISCOVERY_TIMEOUT=120` deploys cleanly. Check that before hunting a
phantom crash.

**It shipped unreachable, and not because of anything in it.** `route()` split
the hash with `h.slice(0, h.indexOf("/"))`; with no slash that is `slice(0,
-1)`, so `"rating"` became `"ratin"` — truthy, so the `|| h` fallback never
fired and every slashless view fell through to the list. "Nothing happens on
click." Queues had been dead the same way since `968d786`, and prod still
carries it until the next release. Fixed in `83ed8af` (PR #50).

**One screen per picture (PR #51, 2026-09-22).** On a MacBook Pro 16 the
sliders began at 814px of 1117 — a scroll per rating. The panel is now a
viewport-sized stage left, one control column right; the whole console runs
one notch under the site's type with compact buttons and a tab strip lit from
the hash. Check fit on `/proto/admin-preview` at 1728×1117 — and click the
HARNESS's Moderation button, not the console's own tab, which needs a
credential and only says "Sign-in required".

**Two traps from the second pass (PR #52, same day).** An `<img>` that is a
GRID ITEM with `width: 100%; height: 100%` is not contained: during track
sizing its percentage width resolves through its own aspect ratio, so a
square picture on a 750px stage asks for 750px and is drawn across the
neighbouring column. Put the picture out of flow (`position: absolute;
inset: 0`) and let `object-fit: contain` scale it. And every console view
awaits a callable: without a navigation epoch, Queues (four collection
scans) answered AFTER the admin had clicked Moderation and drew its card
under the panel — "Queue is not disappearing". `route()` numbers each
navigation now and a late answer renders nothing.

Unwalked: the signed-in admin pass on dev's real `/admin`. The panel was walked
end to end against `/proto/admin-preview`, and the callables are emulator-proven
(86/86), but nobody has yet rated a real picture through the deployed console —
so no `imageModeration` document exists in any environment, and every score in
the wild is still a pure completeness reading (48–58).

Prod has none of this yet. See [[prod-release-order]] and
[[admin-console-ux-pass]] for how a release carries rules and functions, or
fails to.

**SHIPPED TO PROD the same evening** as release `f21a60f` (PR #63, 20:05Z): Josh merged
it by hand; prod functions were deployed by hand at 19:25, the rules went out by the merge
workflow itself (the first CI rules deploy on prod, PRs #64–#66), and the machine check came
back GREEN. Prod's Queues tab is alive again. What that release carried:

- PR #49 ranking + moderation, PR #50 the slashless-hash router fix (prod's
  Queues tab is STILL dead until this ships), PR #51 one-screen panel,
  PR #52 stage/status/epoch fixes, PR #54/#55 aesthetics-first weights and
  the two-panel layout, PR #56 professional/knowledge as yes/no, PR #57 the
  `[hidden]` rule that took the 0 off the Queues tab.
- Also in it, not the console: the operator digest (see
  [[admin-digest-replaces-brevo]], functions still UNDEPLOYED on both
  environments) and the release verification protocol
  ([[release-verification-protocol]]).

The next release goes by the weekly train, see [[weekly-release-train]]. Still unwalked:
nobody has rated a real picture through prod's `/admin`.
