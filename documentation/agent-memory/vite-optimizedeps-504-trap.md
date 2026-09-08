Mirrors the `~/.claude` memory file `projects/D--SynoDrive-VSCN/memory/vite-optimizedeps-504-trap.md` — keep both copies in sync.

---
name: vite-optimizedeps-504-trap
description: "A dev server can serve dep URLs it no longer has — no reload fixes it, only a restart; optimizeDeps.include now pre-bundles the eleven"
metadata: 
  node_type: memory
  type: project
  originSessionId: c3f89e1e-2d2b-41da-8fa2-817b9e28b768
  modified: 2026-09-08T12:17:31.629Z
---

Every bare package this site imports is reached from an Astro inline `<script>` — `gsap`,
`gsap/ScrollTrigger` and `photoswipe` by `await import()`, and `photoswipe/lightbox`,
`embla-carousel` and the six `firebase/*` entry points by a plain `from "…"` inside the script
tag. **Vite's cold-start scanner walks neither kind**, so before 2026-09-08 it met all eleven one
page request at a time. Each discovery triggers a re-optimize, each re-optimize bumps
`browserHash`, and the URLs handed out by the round before go stale — five sequential requests
produced five different hashes and four `504 Outdated Optimize Dep`.

The severe form: if the deps cache is rebuilt *underneath a running server* (observed 2026-09-08,
36 minutes into a server's own run — trigger never identified), the optimizer drops every
discovered dep back to Astro's four baseline entries and takes a new `browserHash`, while Vite's
per-module transform cache keeps rewriting imports to the **old** hash. The server then 504s its
own URLs on a completely fresh page load. The tell is a mismatch you can read off disk:

    CommunityGrid index=1                    →  deps/gsap.js?v=85a636a4
    node_modules/.vite/deps/_metadata.json   →  "browserHash": "1c398c8f"

`astro.config.mjs` now names all eleven under `vite.optimizeDeps.include`, so they are pre-bundled
at boot and there is no discovery round to go wrong — verified by a first-pass fetch giving one
hash and five 200s where it used to give five hashes and four 504s.

Separately and still open: Astro 6.3.5 injects `/@id/astro/runtime/client/dev-toolbar/entrypoint.js`
with **no** `?v=`, but has that module in optimizeDeps and so demands the hash. It 504s once per
page load, forever. Append `?v=<browserHash>` by hand and it is 200. Dev toolbar only.

**Why:** the failure looks exactly like a stale browser tab, and it is not — a hard reload, a
cache clear and a new tab all fail identically, because the incoherence is inside the server
process. Time goes into the browser when the answer is on disk.

**How to apply:** on any `504 Outdated Optimize Dep`, compare the `?v=` the server *emits* (fetch
the `.astro?astro&type=script&index=N` module and grep for `deps/…?v=`) against `browserHash` in
`node_modules/.vite/deps/_metadata.json`. If they differ, kill the server, `rm -rf
node_modules/.vite`, restart — nothing short of that recovers it. When a script starts importing a
new bare package, add it to the `include` list or it re-enters the discovery path. Note also that
`wt-*` worktrees made by `npm run worktree` **junction** `node_modules` to `repo/node_modules` and
therefore share one deps cache, so a dev server started in one can inflict this on the others; see
[[preview-tool-ignores-worktree-launch-json]] and [[concurrent-session-stash-hazard]].
