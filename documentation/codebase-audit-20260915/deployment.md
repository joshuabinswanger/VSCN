# Audit release deployment — 2026-09-15

## Release source

- Isolated checkout: `D:/SynoDrive/VSCN/wt-audit-release-20260915`.
- Release commit: `7a2187b0d9e91768dc8fee4193d335f4fe618c97`.
- Staging merge: `d27b3e6157a1702a38a7d2aa325289a50c91e9bf`.
- Staging PR: https://github.com/joshuabinswanger/VSCN/pull/36 (merged).
- Production PR: https://github.com/joshuabinswanger/VSCN/pull/37 (merged).
- Production merge: `6fb4d01c4eeae5be0f1287bf2b822b16c17c1132`.
- The original shared checkout and its pre-existing edits were preserved.

## Integrated changes

The release was integrated in a separate worktree onto newer remote work. It retains server-allocated pending uploads, WebP validation, generation-pinned image copying, image filtering, and separate keyless export/deployment identities. It adds the audit's atomic profile saves, cancellation fixes, deletion leases/write barriers, current-state slug handling, and durable publication queue.

Export, native image rendering and Hosting deployment run on separate CI runners. Publication is acknowledged through an IAM-private backend endpoint; only each environment's Hosting deployer can invoke it. No new service-account keys were created. Deletion revokes upload permits without adding a third cross-service lookup to Storage rules. An upload that races with deletion removes only its own copied generation.

## Validation completed

- Clean root and Functions installs: zero reported dependency vulnerabilities.
- ESLint passed; Astro diagnostics: zero errors, zero warnings, one existing hint.
- 87 unit tests passed.
- 71 Functions/Firestore/Storage emulator tests passed, including permit revocation, publication acknowledgment and deletion/upload race coverage.
- PR #36: GitHub verification, export, rendering and preview deployment passed.
- Staging and production Firestore/Storage rules and all Functions deployed successfully.
- Both environments: unauthenticated upload authorization, account deletion and admin lookup return HTTP 401 `UNAUTHENTICATED`.
- Both private publication endpoints reject anonymous requests with HTTP 403.
- Live Hosting and publication-receipt results are confirmed below.

## Staging Hosting confirmed

- Workflow: https://github.com/joshuabinswanger/VSCN/actions/runs/34988508732 — all jobs passed.
- https://vscn-dev-f4b60.web.app/community returns build `d27b3e6` and `Cache-Control: must-revalidate, max-age=0`.
- Revision `55532b1b-85ef-4d9d-806b-e82fecf81022` was acknowledged after deployment; pending state cleared.
- Production PR #37 verification, export, rendering and preview jobs also passed before merge.

## Production Hosting confirmed

- Workflow: https://github.com/joshuabinswanger/VSCN/actions/runs/34989071488 — verification, export, rendering and deployment all passed.
- https://vscn.ch/, `/community`, `/de/community`, and `/login` each returned HTTP 200 with build `6fb4d01`.
- Community HTML uses `Cache-Control: must-revalidate, max-age=0`; its CSP is present.
- A referenced hashed asset returned HTTP 200 and `Cache-Control: public, max-age=31536000, immutable`.
- Revision `3117f27e-97f3-471c-8405-c17b24d93258` was acknowledged after deployment; pending state cleared.
- Backend, security rules, and the site are published. Interactive signed-in browser flows were not exercised against real production accounts.

## Scope

No real member account was deleted or modified to test the release. Operational release queue documents track deployment completion. The older audit/remediation notes describe the original local implementation; this deployment note supersedes their outstanding rollout and credential-isolation statements.
