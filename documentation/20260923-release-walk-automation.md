# Release walk automation

**Status:** approved in chat 2026-09-23, built the same day; first CI walk GREEN on prod the same
morning (run 35828595679). Companion to
[20260922-release-verification-protocol.md](20260922-release-verification-protocol.md), whose
§6 defines the human walk this automates. Operating notes live in
[release-verification.md](release-verification.md); verdicts in [release-log.md](release-log.md).

## 1. The problem

The protocol has two halves. The machine check ran green on the first prod release it covered.
The human walk, the half that actually uploads an image as a member, had never been run on any
environment, because it depends on a person having three minutes at the moment a release lands.
The 2026-09-14 outage was invisible to every test for eight days precisely because nobody did
that walk. A step that depends on a person is a step that does not happen.

## 2. Decision

Playwright walks the six steps as a standing **verification member**, on production, from CI,
as the last job of every release. It also runs on demand from a terminal. The release log's
`Walk:` line comes from the job instead of from a person.

The alternative that was considered and rejected: a fresh plus-addressed account per run,
signed up and deleted by the script. Its one gain is signup coverage. Its costs are that CI must
read Josh's Gmail to click the verification link, every run mails the operator a signup digest,
and for the seconds between creation and completion the profile is publishable and no client
may set `moderationHidden`. A standing member has none of those. Signup coverage belongs on
dev, where Turnstile always passes, as a separate piece of work.

## 3. What stands in the way: Turnstile

Prod attests App Check with a real Cloudflare Turnstile key and enforces App Check on Auth and
Firestore. Cloudflare's challenge exists to fail exactly the browser Playwright is, so a bot
that solves the challenge honestly is a coin toss by design.

The walk sets the App Check SDK's **debug token** on `window` before any page script runs. The
SDK then exchanges that token with Firebase instead of calling the Turnstile provider at all
(`@firebase/app-check`, `getToken`, the `isDebugMode()` branch), and Firebase mints a real App
Check token because the debug token is registered for the prod web app. Enforcement is
untouched; every Auth and Firestore call still carries a valid token. The registration was
done once through the App Check REST API and the token lives in a GitHub secret.

**Known gap, on purpose:** the walk does not exercise the Turnstile mint function
(`functions/src/appCheck.ts`) or the challenge itself. Those are Cloudflare's and are not the
kind of drift between repo and project this protocol exists to catch. If they break, members
see the security-check sentence, which is the loud failure the provider was designed to give.

## 4. The member

- One real Auth account on `vscn-39508`: `joshua.binswanger+vscn-walk@gmail.com`, created by
  hand through the wizard on 2026-09-22, email verified, profile complete.
- Its public profile carries `moderationHidden: true`, set once through the Firestore REST API.
  The export (`scripts/export-site-data.mjs`) drops any such profile, the rating queue skips it,
  and (after the change in §7) so do the operator digest and the rebuild queue. It exercises
  every write path a member has and never appears anywhere a visitor looks.
- Josh holds the password. It went straight into the GitHub secret from his terminal; Claude
  neither has it nor needs it. Locally the walk reads it from the environment or from an
  untracked `.env.walk`.
- Verified matters: an unverified account may hold exactly one image at the fixed slot id. The
  walk uploads one image, so it would pass either way, but a verified member takes the
  ordinary uuid path, which is the one real members use.

## 5. The script

`scripts/walk-release.mjs`, on `@playwright/test` (Chromium only), with the pure decisions in
`scripts/lib/release-walk.mjs` under unit test. Run: `npm run walk:release -- --project prod`.

The browser context: English pages, `reducedMotion: "reduce"` (the site honours it in twenty
places and it shortens the page loader), a 1280×900 viewport, the debug token injected through
`addInitScript`. Before the steps it renders a 1200×800 fixture with sharp, stamped with the
release and the time, so the caption and the picture both say which run made them.

The steps are the protocol's six, driven through the ids and `data-*` hooks the editor already
exposes for behaviour (never through class names used for styling):

| # | Step | Passes when |
| --- | --- | --- |
| 1 | sign in | `/login` submits and `/profile` reports `#profile-form.is-loaded`; `#auth-error` never shows |
| 2 | upload | one `.gallery-item` appears in `#gallery-editor` and no queue row carries `.has-error`; the image src names the member's uid |
| 3 | caption and save | the caption is written, `#save-msg` becomes visible, `#save-error` does not |
| 4 | preview | the Preview tab renders exactly one `img.mprof__img` under `[data-ppv-root]`, with the same src, and the browser has actually loaded it (`naturalWidth > 0`, which is Storage serving the object) |
| 5 | delete | the remove control empties `#gallery-editor` and no error note shows |
| 6 | sign out and anonymous | `#btn-logout` lands on the home page with `#nav-join` visible; the home page and the first member page linked from `/community/` return 200 and render |

Before step 2 the script removes any image a failed earlier run left on the member, and says
so in its output: a member that silently fills to the cap would make every later walk fail for
the wrong reason. After the steps, whatever happened, it tries once more to remove the image if
it is still there.

Failure stops the walk at that step. The script writes a screenshot, the page's console and
every failed or 4xx/5xx request into `walk-artifacts/`, prints a `PASS`/`FAIL` row per step and
the ready-to-paste `Walk:` line, and exits 1. It only ever acts as the member, through the
site's own front end, so it cannot do anything a member cannot.

## 6. CI

A `walk` job in `firebase-hosting-merge.yml`, after the acknowledgement step, calling the
reusable `release-walk.yml`, which also carries `workflow_dispatch` for a walk on demand.

The job runs **only on `push` events**. This is not tidiness. Every walk writes an image record
and saves the profile, which dirties `rebuildQueue/site`; `flushMemberRebuilds` then dispatches
this very workflow as `workflow_dispatch` within five minutes. A walk that ran on that dispatch
would dirty the queue again and the site would rebuild itself, and walk itself, every five
minutes for ever. (§7 removes the dirtying for hidden members, but the gate stays: the walk
should follow a release, not a rebuild.)

**From CI the walk goes to `https://vscn-39508.web.app`, not vscn.ch.** vscn.ch is proxied by
Cloudflare, and its bot protection answered the first CI walk (2026-09-23) with a 403 "Just a
moment..." challenge before the site was reached: GitHub's runners are datacenter IPs. The
Hosting origin serves the same release byte for byte, is an authorised Auth domain, and every
Firebase call from it is identical. What CI skips is the Cloudflare proxy itself, which does not
change per release; a local run still walks vscn.ch.

Failure artefacts upload with the run. A red walk is a red workflow. The protocol already says
what that means: a release incident, fix or roll back, and do not fix from inside the walk.

## 7. Two side effects, silenced

Both are one small change in `functions/src`, tested against the emulator, and both reach prod
with the next functions deploy (still by hand until the release train exists). Until then each
release costs Josh one digest mail and one redundant prod rebuild. Neither breaks anything.

- **`onImageWentLive` skips hidden owners.** The operator digest reports every member image that
  crosses into `live`. A hidden member's pictures never reach the site, so they are not the
  operator's news either.
- **`queueMemberRebuild` fingerprints what the site would show.** The export drops profiles with
  `active: false` or `moderationHidden: true`, so for the build such a profile is absent. The
  fingerprint now treats it as absent. A hidden member's uploads therefore change nothing and
  queue nothing, while hiding or deactivating a visible member still changes the fingerprint and
  queues the build that drops them. (`adminSetProfileActive` also dispatches directly, as before.)

## 8. One-time setup

| What | Who | Done |
| --- | --- | --- |
| Verification member, wizard complete, email verified | Josh | 2026-09-22 |
| `moderationHidden: true` on `publicProfiles/<uid>` | Claude, Firestore REST | 2026-09-22 22:07Z |
| Debug token registered on the prod web app (`release walk (CI)`) | Claude, App Check REST | 2026-09-23 |
| GitHub secret `WALK_MEMBER_PASSWORD` | Josh, `gh secret set` | 2026-09-22 |
| GitHub secrets `WALK_MEMBER_EMAIL`, `WALK_APPCHECK_DEBUG_TOKEN` | Josh (secret writes are classifier-blocked for Claude) | 2026-09-23 |

The debug token is a bypass credential for App Check on prod: it lets a holder skip Turnstile,
not the security rules. Rotate it by deleting the entry in the console (App Check → Apps →
Manage debug tokens) and registering a new one.

## 9. Out of scope, and known gaps

- The Turnstile challenge and mint function (§3).
- A walk on dev. Nothing prevents it (dev's Turnstile always passes, so no debug token is
  needed), but it needs its own member and its own secret, and it was not asked for.
- Signup coverage (§2).
- The Cloudflare proxy in front of vscn.ch, from CI (§6).
- The member page in step 6 is a build-time snapshot. The walk asserts that it renders, not
  that it shows this run's image; the member is hidden, so it never would.
- The probe-2 gap in the machine check (deploy-time params in `functions/.env`) is unchanged.
