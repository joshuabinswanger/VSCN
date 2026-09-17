<!-- Mirrors the ~/.claude memory file `admin-console-shows-everything.md` so it travels with the code. Keep both copies in sync. -->

---
name: admin-console-shows-everything
description: Admin console split into six modules and now renders every field both profile docs hold; public/private labelling was positional and lied
metadata: 
  node_type: memory
  type: project
  originSessionId: be0cab60-8649-45a6-af4f-89656734979a
  modified: 2026-09-17T13:59:21.683Z
---

2026-09-17, **PR #42** (`feat/admin-console-detail`, off `56133f8`). Built in
`repo/` but rebuilt onto live dev before commit — see
[[repo-checkout-is-stale-not-dirty]]. The console was rebuilt so nothing
`memberGraph` sends can be dropped, and restructured into nine collapsible
sections. `src/components/admin/AdminConsole.astro` keeps markup, styles, the
forced-token-refresh gate and the hash router; the views live in
`src/lib/admin/` (`dom`, `dialog`, `fields`, `memberList`, `memberDetail`,
`queues`, ~1180 lines).

**The finding that made the rebuild worth doing:** `memberGraph` has always
returned the ENTIRE `users/{uid}` and `publicProfiles/{uid}` documents, and the
console rendered about eight fields and threw the rest away in the browser.
Most of "show me everything" cost no server work at all. The one genuine gap
was `adminActions` — written by `audit()` on every privileged mutation since
the console existed, read back by nothing. `adminListActions` now reads it;
note `firestore.indexes.json` does not exist in this repo, so a
`where` + `orderBy` composite query would need new index infrastructure — it
filters in memory instead, deliberately.

**The trap, found by measuring rather than reading the report:**
`differenceNote(key, pub, usr)` names the two collections in WORDS but took
them by POSITION, while `docRows()` is generic and passes whichever document
it is currently rendering first. So every disagreement marker in the `users/`
section was labelled backwards — it named the public document as holding the
private value, and reported a private-only field as "only in publicProfiles".
Half the markers lied, and the half that lied is the half an admin reads when
chasing a rejected write. Fixed by giving the comparison an explicit
`side: "public" | "private"` so the sentence cannot drift from the document it
describes. The lesson generalises: when a helper's output names its arguments
in prose, positional passing is a latent inversion — see
[[firestore-rules-hasonly-gotcha]] for what these disagreements usually mean.

**Unverified:** everything behind the admin gate. Neither this session nor the
subagent could sign in as an admin, so the gate itself, `/` and Escape
shortcuts, the queue-count badge fetch and the reload-after-mutation round trip
were never walked. The detail renderer was verified against synthetic data in
the dev server. Related: [[dev-deploy-is-ci-only]] — putting this on dev means
merging into dev.

`src/lib/admin/fields.ts` lists `receiveCommunityEmails` and
`correspondenceLanguage` as display keys. They are display-only, so the PR
stands alone, but the fields themselves arrive with PR #45.
