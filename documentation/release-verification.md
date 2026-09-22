# Release verification

After every release, check that the Google project matches the code that shipped, then walk
the site once as a member. Design and rationale: [20260922-release-verification-protocol.md](20260922-release-verification-protocol.md).
History of verdicts: [release-log.md](release-log.md).

## When

| Event | What runs | Who |
| --- | --- | --- |
| Merge to `main` (prod release) | Machine check, then the human walk | Claude runs the check, Josh walks |
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
FAIL  2 functions deployed   16 of 25 exports deployed after their last source change
                            NOT DEPLOYED  adminListActions (exported at 1e033a7)
                            STALE         adminListMembers deployed 2026-09-15T15:26:39Z, source changed 2026-09-17T17:23:05+02:00
```

| # | Probe | What red means |
| --- | --- | --- |
| 1 | build stamp | The live origin does not serve the released commit. The deploy did not land, or an intermediary is caching. |
| 2 | functions deployed | An exported function is missing on the project, or was deployed before its source last changed. The release pipeline deploys hosting only; functions go by hand. |
| 3 | rules parity | The live Firestore or Storage ruleset differs from the rules file at the released commit. Since 2026-09-22 CI deploys rules ahead of Hosting, so a red row means that step failed or was skipped, or someone hand-deployed from another branch. |
| 4 | IAM grants | A grant in the script's `EXPECTED` table is missing, or a forbidden one is present. Each row names what breaks without it. |
| 5 | secrets bound | A secret `defineSecret()` names in `functions/src` does not exist, or has no enabled version. |
| 6 | upload pairing | `authorizeImageUpload` ran three or more times in the window and `completeImageUpload` never did. Uploads are failing for everyone. WARN when fewer than half complete. |
| 7 | function errors | Never red on its own. Any `ERROR` entry from a function in the window is a WARN with the three most frequent messages, and belongs in the log entry. |
| 8 | stranded state | Upload residue (expired permits, records still `uploading`, `pending/` objects) older than the sweep horizon. The sweep is not clearing it. WARN when there is a pile younger than that: uploads are failing, the sweep has not reached them yet. |

Verdict: `RED` if any probe is `FAIL` or `SKIP`, else `GREEN`. A probe that could not run is not a
pass. `WARN` does not change the verdict but goes in the log entry: a warning nobody records is
the same as no warning.

The behaviour probes (6 to 8) read a time window. Override it to look at a past incident:

```powershell
npm run verify:release -- --project prod --since 2026-09-14T00:00:00Z --until 2026-09-22T14:00:00Z
```

`--since` also takes a commit; `--release <sha>` checks a commit other than the branch tip;
`--origin <url>` overrides the live origin. Never point it at a PR preview: a preview's stamp is
the ephemeral `refs/pull/N/merge` SHA.

## The human walk

Three minutes, on prod, after the machine check is green. Signed in as the verification member
(a real account whose public profile carries `moderationHidden: true`, so it never reaches the
directory).

1. Sign in at vscn.ch as the verification member.
2. Upload one gallery image. It must complete without an error banner.
3. Give it a caption and save the profile. The save must confirm.
4. Open the Preview tab. The image must render there.
5. Delete the image, and confirm it disappears.
6. Sign out. Load the home page and one member page anonymously; both must render.

Steps 2 and 3 exercise the callables, the Storage rules, the cross-service IAM, the Firestore
rules and the profile write path together. If any step fails, stop and report it. Do not fix
inside the walk; a half-fixed state makes diagnosis harder.

## The log

Every run appends an entry to [release-log.md](release-log.md). The script prints one ready to
paste. Green entries are one line; the value is the history.

```
## 2026-09-22 · 1e033a7 · prod
Machine: RED — functions deployed: adminListActions not deployed; 8 admin callables stale
         WARN upload pairing: authorize 28 ok of 28 / complete 1 ok of 1
Walk:    not run (blocked on machine check)
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
