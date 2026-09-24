> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/preferred-language-routes-site.md` memory file; keep the two in sync.

---
name: preferred-language-routes-site
description: "users/{uid}.preferredLanguage is site AND email language; only /profile routes, the EN/DE click wins; on dev since 2026-09-23 (PR #73), not on prod"
metadata:
  node_type: memory
  type: project
  originSessionId: 8218ee7e-57c8-4a05-ae9d-f3d2101bf1cd
  modified: 2026-09-23T18:36:36.971Z
---

MERGED TO DEV `dbf23bf` 2026-09-23 via PR #73; staging deploy green, rules deployed ahead of Hosting in the same job. Labelled `ready-for-release` 2026-09-24 at Josh's request. **Not on prod**, and the signed-in walk (redirect on /profile, the switch write) has not been done.

- The field is `preferredLanguage` ("de" | "en"). It was `correspondenceLanguage` on the unmerged `feat/communication-preferences` branch (375d961), renamed before any ruleset accepted it. That branch is now superseded (see [[stale-branches-superseded]]).
- One setting for site and email language. Routing lives in `src/lib/siteLanguage.ts`: only /profile routes (sign-in lands there), an absent value never routes, and the navbar EN/DE click wins for the session via sessionStorage. When signed in, the click also writes the field with `updateDoc`.

**Why:** member feedback "Account sollte präferierte Sprache speichern". Two separate settings would have let a stored site language drift from the one the member actually reads the site in.

**How to apply:** a prod release carrying this must ship `firestore.rules` first (see [[firestore-rules-hasonly-gotcha]]); the release workflow already does. Walk it signed-in on dev before the next prod train.
