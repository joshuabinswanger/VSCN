<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/deploy-dev-needs-development-mode.md — kept in the repo so any Claude instance can read it without the user profile. -->

---
name: deploy-dev-needs-development-mode
description: "Deploying dev needs `--mode development` or /community loses ALL artwork. The stub-`node` half of this note is FIXED as of 2026-09-07 — `npm run deploy:dev` completes both halves again; kept for the diagnosis."
metadata:
  type: project
---

`npm run deploy:dev` is `astro build --mode development && firebase deploy -P dev
--only hosting`. The `--mode development` is load-bearing: it makes Astro read
`.env.development` (project `vscn-dev-f4b60`) instead of `.env` (project
`vscn-39508`, prod).

**Why:** member profiles are synced across both projects but the **galleries
are not** — dev has artwork prod lacks. Build the dev site against prod's
Firestore and every member comes back with zero works, so `hasArtwork` is false
for all of them and the whole directory silently renders as tag cards: 22 tag
cards, 0 image cards, no `<img>` at all. Nothing errors, and the page looks
plausible.

**How to apply:** never `npm run build && firebase deploy -P dev` by hand — it
deploys an artwork-less dev site. Use `npm run deploy:dev`. To verify a dev
build before deploying, count the IMAGES, not the cards:

```
grep -o '<img' dist/community/index.html | wc -l      # 100 on dev, 0 is the failure
```

**The card-count guard this note used to give was wrong and cried wolf**
(2026-09-06). It said `grep -c 'class="ccard"'` "should be 16" — but `grep -c`
counts matching LINES, and two cards share a line, so a perfectly good build
reports **14**; counting occurrences with `-o` gives **15**, not 16 either.
Verified identical on the local build and on the live deployed site, so 15/14 is
the baseline, not a regression. The failure mode this guard exists for is
`hasArtwork` false for everyone, which zeroes the `<img>` count outright — so
count that instead, and compare against the live site rather than a number
written down months ago.

Related: [[dev-vs-prod-firestore-divergence]], [[image-cards-need-content]].

## The second half used to die here - FIXED 2026-09-07

`npm run deploy:dev` built fine and then died on the `firebase deploy` half with:

```
C:\Users\Josh\AppData\Roaming\npm/node_modules/node/bin/node: line 1: This: command not found
```

**Root cause, and it was never about firebase.** A global npm package literally
named `node` (`node@22.11.0`, installed 2024-11-04) was a repackaged Node
distribution from `node-bin-gen`. Its `bin/` holds a real `node.exe` **and** a
34-byte POSIX placeholder called `node` whose entire content is "This file
intentionally left blank" - it exists only so npm on non-Windows has something
to link. On Windows `node.cmd` resolves to `node.exe` via PATHEXT, so the
package looks fine from cmd and PowerShell.

But `npm config get script-shell` here is Git Bash, and npm's **sh** wrapper for
every global CLI ends with:

```sh
if [ -x "$basedir/node" ]; then
  exec "$basedir/node"  "$basedir/node_modules/<pkg>/..." "$@"
else
  exec node  "$basedir/node_modules/<pkg>/..." "$@"
fi
```

`$basedir/node` existed, sh does not append `.exe`, so it executed the
placeholder. **Every** npm-installed CLI was broken under bash, not just
firebase - `gemini`, `glslify` and `gltf-transform` failed identically. It read
as a firebase problem only because that is where it was first met, and because
`Get-Command node` reports the real binary, so nothing looked wrong with node.

**The fix, applied:**

```powershell
npm uninstall -g node
```

With no `$basedir/node`, the wrapper falls through to `exec node` from PATH.
Verified after: `firebase --version`, `gemini --version` and `glslify --version`
all answer under bash, and `npm run deploy:dev` completes build *and* deploy in
one command. Reversible with `npm i -g node@22.11.0`, which reintroduces the bug.

**How to apply:** `npm run deploy:dev` is one command again - use it, and do not
reach for the old two-step workaround. If an npm-installed CLI ever dies under
bash with "line 1: This: command not found", check `npm ls -g --depth=0` for a
package named `node`.

**Loose end:** `node` resolves to different versions per shell - bash gets nvm's
(v25.9.0, via `~/AppData/Local/Author Software/nvm`), PowerShell gets
`C:\Program Files\nodejs` (v24.11.1). Harmless for this repo, but a
version-sensitive build can differ by which shell launched it.
