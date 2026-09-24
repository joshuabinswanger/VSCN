> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/functions-deploy-discovery-timeout.md` memory file; keep the two in sync.

---
name: functions-deploy-discovery-timeout
description: "Timeout after 10000" on a functions deploy from Josh's machine is the CLI's discovery window, not broken code; FUNCTIONS_DISCOVERY_TIMEOUT=60 gets past it
metadata:
  type: reference
---

On 2026-09-23, `firebase deploy --only functions:… -P dev` failed at "User code failed to load. Cannot
determine backend specification. Timeout after 10000". `GCLOUD_PROJECT=vscn-dev-f4b60 node -e
"require('./functions/lib/index.js')"` loaded in ~1.2 s, so the code was fine. Rerunning with the
environment variable `FUNCTIONS_DISCOVERY_TIMEOUT=60` deployed cleanly (bash: prefix the command; PowerShell:
`$env:FUNCTIONS_DISCOVERY_TIMEOUT = '60'` first).

**Why:** admin.ts's lazy `getBucket()` comment records the same error message for a real module-scope
crash, so the message alone does not tell you which case you are in.
**How to apply:** first time the module with the project env set. If it loads, raise the timeout. If it
throws, the error is the real cause. Plain `firebase` works here; `npx firebase` does not ([[site-footer-is-fixed-chrome]]).
