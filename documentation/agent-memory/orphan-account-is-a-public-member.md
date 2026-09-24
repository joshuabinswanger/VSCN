> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/orphan-account-is-a-public-member.md` memory file; keep the two in sync.

---
name: orphan-account-is-a-public-member
description: "prod's Auth-less orphan users/z3IedZOQ… is a FULL member of the public directory as \"Test\" with a live /members/test page; scripts/purge-orphan-account.mjs removes it but running it against prod is classifier-blocked for me"
metadata: 
  node_type: memory
  type: project
  modified: 2026-09-07T08:37:22.136Z
  originSessionId: 30b33a02-015d-4ca8-85e3-8463a48998ac
---

`users/z3IedZOQ6zR5Hnqvxq4T0sw76sy2` on **prod** has no Auth user —
`check-integrity.mjs -P prod` has reported it as the environment's only problem for
days. On 2026-09-07 it turned out not to be a filing error: its `publicProfiles` doc
is `active: true` under the name **Test**, so it is one of the 24 members on
vscn.ch/community and `https://vscn.ch/members/test` returns **200**.

**Why:** the build reads `publicProfiles` and never consults Auth. Nothing in the
system asks whether a profile's account still exists — `active !== false` is the
whole test. So an orphan is not a dangling record, it is a member, and a visiting
researcher sees it as one.

**How to apply:** treat a `has no Auth user` line from the integrity check as
public-facing until proven otherwise, and check `active` on the public doc rather
than assuming a broken account is invisible. The same reasoning applies to any
future field that gates publication: if the build's filter and the account's real
state are held in different collections, they can disagree indefinitely.

`scripts/purge-orphan-account.mjs -P prod <uid>` (dry run; `--write` to act) collects
and removes both profile docs, the `slugs` entry, the `images` records and the storage
objects under `users/<uid>/` and `galleries/<uid>/`. It refuses outright if the uid
still HAS an Auth user, because a live account must go through
`requestAccountDeletion` — see [[account-deletion-is-immediate]].

**Two traps in doing it:** running that script against prod is refused by the Claude
Code permission classifier (the dry run too), so it is Josh's to run; and deleting
the documents does NOT take the page down, because the directory is a static
snapshot. The removal is only finished after a rebuild —
`gh workflow run firebase-hosting-merge.yml`.
