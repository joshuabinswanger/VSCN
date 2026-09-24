> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/stale-secret-binding-survives-deploy.md` memory file; keep the two in sync.

---
name: stale-secret-binding-survives-deploy
description: "CLOSED 2026-09-24. A function that STOPS declaring secrets keeps its old bindings: firebase-tools drops an empty secretEnvironmentVariables from the update mask. Deleting BREVO_API_KEY on 2026-09-23 left onAuthUserCreated unable to start on BOTH projects"
metadata:
  node_type: memory
  type: project
  originSessionId: 8cd68bba-ac2b-46a6-8302-9a1a617ff7ce
  modified: 2026-09-24T07:25:31.281Z
---

**Found 2026-09-24.** `firebase deploy -P dev --only functions` failed on `onAuthUserCreated` alone
with "health check failure … This deployment uses Secrets … secretAccessor". The "grant IAM" wording is
the generic suffix. The real log line: `Could not fetch secret ".../BREVO_API_KEY/versions/2" … Instance startup will now abort`.

**Mechanism.** firebase-tools 15.18 `gcp/cloudfunctions.js` `updateFunction` builds the PATCH mask with
`proto.fieldMasks`, which *skips an empty array*. So a gen1 function whose code declares no secrets
never sends `secretEnvironmentVariables`, and the server keeps whatever was bound before.
`onAuthUserCreated` declared `BREVO_API_KEY` + `ADMIN_NOTIFY_TO` in the Brevo era. The 2026-09-22 digest
rewrite dropped both from code, but the deployed function kept `BREVO_API_KEY@2` (dev) / `@1` (prod).
Josh deleted the `BREVO_API_KEY` secret on both projects on 2026-09-23 ~08:05Z (the cleanup in
[[admin-digest-replaces-brevo]]). From then on, no new instance can mount it: no deploy passes its
health check, **and a cold start of the SERVING revision fails too**, so a signup would go unqueued.
The signup itself still succeeds (v1 onCreate is non-blocking and not retried). No prod signup has
fired since (last `Signup queued` 2026-09-22 22:01Z), so nothing is lost yet.

**Fix is state, not code.** Clear the field once. After that, deploys send nothing, and nothing stale is left:
`PATCH https://cloudfunctions.googleapis.com/v1/projects/<id>/locations/us-central1/functions/onAuthUserCreated?updateMask=secretEnvironmentVariables`
with body `{}`. It rolls out the EXISTING source, so on dev follow it with
`firebase deploy -P dev --only functions:onAuthUserCreated` to ship current code. The classifier refuses
this PATCH for me, on dev too ("Modify Shared Resources"), so Josh runs it. Rejected alternative: binding
an unneeded secret via `runWith` just to force a non-empty list.

**How to apply:**
- Before deleting or destroying ANY secret, list what still binds it (both gens):
  `gcloud functions list --project <id> --format=json` → `secretEnvironmentVariables` /
  `serviceConfig.secretEnvironmentVariables`. Code no longer referencing it proves nothing.
- When removing a function's LAST secret, clear the binding by hand as above. A deploy won't.
- **STATUS 2026-09-24: CLOSED on both projects.** Prod PATCHed 07:37Z, dev PATCHed and redeployed from the worktree 07:59Z; both ACTIVE, no bindings, no startup warnings since. `origin/main` declares no Brevo secret. The empty `BREVO_API_KEY` the aborted `repo/` prompt recreated on dev at 07:35:56Z is deleted again; neither project has one. Not yet exercised by a real signup.
- **Deploy from a worktree, never `repo/`.** Josh's first redeploy ran from `repo/` (stale `49d9be8`), whose `authTriggers.ts` still declares `BREVO_API_KEY`. The CLI stopped to PROMPT for the secret value. Typing anything would have recreated the secret and re-bound it. The prompt itself is the tell: current code declares no Brevo secret. See [[signup-ping-proven-and-its-traps]] trap 1.
