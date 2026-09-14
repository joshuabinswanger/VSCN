# Administrator profile hiding

`publicProfiles.moderationHidden: true` excludes a member from website publishing independently of the member-owned `active` preference. Absent or false means no moderation restriction. Public Firestore and image reads are unchanged: this is website moderation, not data confidentiality.

The existing admin callable `adminSetProfileActive` now sets `moderationHidden` to the inverse of its boolean `active` argument. It requires the signed admin claim, records the action and dispatches a site rebuild. It preserves `active`, so removing moderation does not publish a member's draft or reverse a pending deletion hide. The console offers Hide profile / Remove moderation hide and distinguishes administrator hiding from the member's unpublished state.

Rules reject member creation, addition, modification or removal of the moderation field, including replacement writes. Owners can still correct their profile and change their own publish preference. Both browser directory reads and static builds filter the protected flag. Member pages, retired slug aliases and community artwork derive from that filtered directory. Deletion cancellation only restores `active`, so it cannot clear moderation.

## Rollout

Deploy the rules, updated callable and rebuilt Hosting site together in a coordinated release. Publish the new Hosting reader before using the updated callable; an older site reader ignores the new field. The change is implemented locally and has not been deployed.

Previous `active:false` records do not say whether the member or an administrator hid them. Review those records and use Hide profile on profiles requiring moderation. Do not automatically convert all drafts into moderation bans. Removing moderation from a legacy inactive record leaves the old `active:false` preference intact.

As with the existing admin action, public static pages change after the requested build deploys successfully. A failed build leaves previous pages online; inspect the deployment status after moderation. Previously downloaded files and third-party caches cannot be recalled.

## Validation

Unit tests cover the visibility combinations; emulator tests attempt field injection, resetting, deletion, replacement, cross-user writes and republishing, while checking that legitimate edits and administrator restoration still work. The full profile test also exercises the added checks with eight gallery images and maximum field sizes.

Results: 79 unit tests and 49 Firestore/Storage emulator tests passed. Functions TypeScript compilation and ESLint on the changed frontend files passed. The broader `astro check` reported 24 errors, all in untouched components/pages; its output is saved in `security-audit-20260914/moderation-astro-check.txt`. No live build or deployment was triggered.

Emulator command (alternate ports avoid an existing service on 8080):

```powershell
npx -y firebase-tools@latest emulators:exec --config firebase.security-audit.json --only firestore,storage --project demo-vscn-rules "node --test --test-concurrency=1 tests/rules/*.test.mjs"
```
