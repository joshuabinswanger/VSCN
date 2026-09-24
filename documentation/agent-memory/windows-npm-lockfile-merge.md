> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/windows-npm-lockfile-merge.md` memory file; keep the two in sync.

---
name: windows-npm-lockfile-merge
description: "npm 11 on Windows rewrites package-lock.json — drops Linux-optional @emnapi entries and flips peer/dev flags — so CI's npm ci breaks; add a dependency by MERGING entries into the base lockfile"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 93e93cfb-9cf8-4fb7-9b05-140b5f0c59ce
  modified: 2026-09-24T01:22:30.848Z
---

Adding `sortablejs` on 2026-09-23 with `npm install` (npm 11.12.1, Windows) produced a lockfile that deleted `node_modules/@emnapi/core` and `@emnapi/runtime` (still required by `@img/sharp-wasm32`) and flipped ~30 `peer`/`dev` flags. `npm ci` then failed outright. `npm install --package-lock-only` did the same. Same failure as commit `cf8f7ac` on 2026-09-15.

**Why:** Windows npm prunes optional platform-specific entries that the Linux CI runners need; no local npm flag fixed it.

**How to apply:** restore the base lockfile, then copy in ONLY `packages[""]` dependency lists and the new `node_modules/<pkg>` entries from npm's generated file (a small Node script outside the repo), check `git diff` shows additions only, and prove it with `npm ci --ignore-scripts` in a scratch dir before committing. The PR's Linux `verify` job is the final proof. Related: [[conflict-free-merge-semantic-break]].
