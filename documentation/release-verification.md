# Release verification

After every release, check that the Google project matches the code that shipped, then walk
the site once as a member. Design and rationale: [20260922-release-verification-protocol.md](20260922-release-verification-protocol.md).
History of verdicts: [release-log.md](release-log.md).

## When

| Event | What runs | Who |
| --- | --- | --- |
| Merge to `main` (prod release) | Machine check, then the walk | Claude runs the check; the walk runs from CI as the last job of the merge |
| Merge to `dev` | Machine check only | Claude, without being asked |

A red dev check is a finding to fix before the same release reaches prod. A red prod check is a
release incident: fix or roll back before the walk.

## The machine check

```powershell
npm run verify:release -- --project prod
npm run verify:release -- --project dev
```

Read-only. It needs the gcloud CLI signed in as the project owner (`gcloud auth login`); nothing
else. It fetches `origin/<branch>`, treats its tip as the released commit and the previous
first-parent commit as the previous release, and prints one row per probe:

```
PASS  1 build stamp          live 1e033a7 = released 1e033a7, built 2026-09-22T14:23:37Z
FAIL  2 functions deployed   ARTIFACT MISMATCH adminListActions: not deployed, expected 8f4c11659fad2a39c8557c50236c9acc217a51fd
                            ARTIFACT MISMATCH adminListMembers: unstamped, expected 8f4c11659fad2a39c8557c50236c9acc217a51fd
```

(Illustrative. Probe 2 changed from a timestamp comparison to a source-digest comparison in
PR #140; the 2026-09-22 outage this sample comes from was found by the old wording.)

| # | Probe | What red means |
| --- | --- | --- |
| 1 | build stamp | The live origin does not serve the released commit. The deploy did not land, or an intermediary is caching. |
| 2 | functions deployed | An exported function is missing on the project, or its `source_digest` label differs from the digest of the released commit's backend (`functions/src`, `functions/package*.json`, `tsconfig.json` and the `functions/.env*` files, comments stripped; `scripts/lib/backend-digest.mjs`). Both Hosting workflows deploy Functions first (see [20260928-backend-deploy-identity-and-rollback.md](20260928-backend-deploy-identity-and-rollback.md)), so a red row means that job failed or left a mixed backend, or someone deployed by hand from another tree. A deployed function the release no longer exports is a WARN (`ORPHAN`), never a delete. |
| 3 | rules parity | The live Firestore or Storage ruleset differs from the rules file at the released commit. Since 2026-09-22 CI deploys rules ahead of Hosting, so a red row means that step failed or was skipped, or someone hand-deployed from another branch. |
| 4 | IAM grants | A grant in the script's `EXPECTED` table is missing, or a forbidden one is present. Each row names what breaks without it. |
| 5 | secrets bound | A secret `defineSecret()` names in `functions/src` does not exist or has no enabled version, or one of the twelve function/secret bindings the script requires (`sendAdminDigest`, `mintAppCheckToken` and the nine functions that use `GITHUB_REBUILD_TOKEN`) is unbound or points at a version that is not `ENABLED`. A new secret version changes nothing until the function is redeployed, so the bound version is the one that counts. |
| 6 | upload pairing | `authorizeImageUpload` ran three or more times in the window and `completeImageUpload` never did. Uploads are failing for everyone. WARN when fewer than half complete (ten or more authorised). **Zero traffic in the window is also a WARN, `NOT TESTED`, and the verdict stays GREEN with exit code 0**: a quiet window is not evidence that uploads work. |
| 7 | function errors | Never red on its own. Any `ERROR` entry from a function in the window is a WARN with the three most frequent messages, and belongs in the log entry. |
| 8 | stranded state | Upload residue (expired permits, records still `uploading`, `pending/` objects) older than the sweep horizon. The sweep is not clearing it. WARN when there is a pile younger than that: uploads are failing, the sweep has not reached them yet. |

Verdict: `RED` if any probe is `FAIL` or `SKIP` (exit code 1), else `GREEN` (exit code 0). A probe
that could not run is not a pass. `WARN` does not change the verdict but goes in the log entry: a
warning nobody records is the same as no warning. `NOT TESTED` is the case to watch: it reads GREEN.

The check is run by hand. As of 2026-09-29 nothing in CI runs `verify:release`; the `verify`
workflow is the unit, emulator and build gate, and the walk is the only post-release check CI
performs.

The behaviour probes (6 to 8) read a time window. Override it to look at a past incident:

```powershell
npm run verify:release -- --project prod --since 2026-09-14T00:00:00Z --until 2026-09-22T14:00:00Z
```

`--since` also takes a commit; `--release <sha>` checks a commit other than the branch tip;
`--origin <url>` overrides the live origin. Never point it at a PR preview: a preview's stamp is
the ephemeral `refs/pull/N/merge` SHA.

## The walk

Six steps on prod, as the verification member: a real account whose public profile carries
`moderationHidden: true`, so it exercises every write path a member has and never reaches the
directory, the rating queue, the operator digest or a rebuild.

1. Sign in at vscn.ch as the verification member.
2. Upload one gallery image. It must complete without an error banner.
3. Give it a caption and save the profile. The save must confirm.
4. Open the Preview tab. The image must render there.
5. Delete the image, and confirm it disappears.
6. Sign out. Load the home page and one member page anonymously; both must render.

Steps 2 and 3 exercise the callables, the Storage rules, the cross-service IAM, the Firestore
rules and the profile write path together.

Since 2026-09-23 Playwright walks these steps ([scripts/walk-release.mjs](../scripts/walk-release.mjs),
design in [20260923-release-walk-automation.md](20260923-release-walk-automation.md)). The
`walk` job of the production merge workflow runs it after the acknowledgement step, on `push`
events only, and prints the `Walk:` line for the log entry. From CI it walks
`https://vscn-39508.web.app`, the same Hosting release, because Cloudflare answers GitHub's
runners on vscn.ch with a bot challenge. On demand, from a machine Cloudflare lets through:

```powershell
npm run walk:release -- --project prod
```

It needs `WALK_MEMBER_EMAIL`, `WALK_MEMBER_PASSWORD` and `WALK_APPCHECK_DEBUG_TOKEN` in the
environment or in an untracked `.env.walk`. The debug token makes the App Check SDK skip
Turnstile, a challenge built to fail exactly this browser; enforcement and the rules are
untouched, and the Turnstile mint function is the one thing the walk does not cover.

A failed step stops the walk. The step's screenshot, the page console and every failed request
are in `walk-artifacts/` (uploaded with the CI run, the debug token and the member's credentials
redacted first). Fix or roll back, then re-run; do not fix
inside the walk. Before uploading, the script removes any image a failed earlier run left on
the member and says so, so the member never fills to the cap and fails a later walk for the
wrong reason.

## The log

Every run should leave an entry in [release-log.md](release-log.md). Nothing appends it: the script
prints one ready to paste and whoever ran it pastes it, so a release that was never checked by hand
has no entry (the 2026-09-28 and 2026-09-29 production releases were the first to show that; the
log now carries them, marked with what could not be confirmed). Green entries are one line; the
value is the history.

```
## 2026-09-22 · 1e033a7 · prod
Machine: RED — functions deployed: adminListActions not deployed; 8 admin callables stale
         WARN upload pairing: authorize 28 ok of 28 / complete 1 ok of 1
Walk:    RED — step 2 (upload) failed on vscn.ch for 1e033a7: queue row reported: Upload failed. Try again.
Action:  functions deployed 2026-09-2x, re-verified green
```

## Maintaining the expectations table

`EXPECTED` at the top of [scripts/verify-release.mjs](../scripts/verify-release.mjs) is the only
written record of the IAM grants this project depends on. Adding a grant to a project without
adding it there is how the 2026-09-14 outage happens again. Record what is intended, with the
consequence of its absence, not merely what is present.

Applying a grant by hand: if the policy already holds conditional bindings, `gcloud` demands a
condition. These grants are unconditional; pass `--condition=None`.

A functions deploy rewrites `acknowledgeSitePublication`'s invoker policy from the deploy
manifest, so whatever the code declares wins over anything granted by hand. Until 2026-09-22 the
code said `invoker: "private"`, which declares nobody, and every `firebase deploy --only functions`
silently revoked the hosting deployer, failing the next release's last step with 403.
[functions/src/publication.ts](../functions/src/publication.ts) now names the deployer, derived from
the project being deployed to, so the deploy applies the binding itself.

If probe 4 reports that grant missing, do not re-apply it by hand: it means the project was last
deployed from a commit that still said `private`. Deploy functions from a commit that has the fix
and the binding comes back.

Deploying functions non-interactively on this machine also needs `FUNCTIONS_DISCOVERY_TIMEOUT=120`,
dotenv values in `functions/.env` for every `defineString` param (a code default is not enough),
and `--force` for any function with a retry policy. `--force` also deletes deployed functions the
source no longer exports, so read probe 2's ORPHAN rows before using it.

## Out of scope

Auth templates and the action URL, DNS and the mailbox, the Turnstile dashboard, and Firestore
indexes (there is no `firestore.indexes.json`; indexes live in the console and are currently
unobservable). These do not change per release and are reviewed occasionally rather than checked
badly every time.
