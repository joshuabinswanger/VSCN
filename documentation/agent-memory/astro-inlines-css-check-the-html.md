> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/astro-inlines-css-check-the-html.md` memory file; keep the two in sync.

---
name: astro-inlines-css-check-the-html
description: "FEEDBACK — I claimed a stylesheet was missing from a built page because I grepped the linked .css chunk; Astro had inlined it in a <style> tag, and grep -c on minified HTML counts LINES not matches"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: b22d44d4-fa31-43aa-9dbf-424f585bd4f4
  modified: 2026-09-09T09:43:30.254Z
---

**2026-09-08.** Chasing why the card preview was not full width, I concluded that
`communityCard.css` was entirely absent from the built `/profile` page — "the card reaches the
page with NONE of its layout rules" — and on that basis changed `astro.config.mjs` to
`vite.build.cssCodeSplit: false`, a site-wide change. Josh said **"check again"**. The CSS was
there the whole time, and the real cause was an unrelated `max-width` cap
([[shared-stylesheet-preview-mechanism]]).

**The two mistakes, both mechanical:**

1. **Astro inlines stylesheets into a `<style>` tag** (`build.inlineStylesheets: "auto"` is the
   default — small sheets are inlined, larger ones linked). I grepped the two
   `<link rel="stylesheet">` chunks and the JS bundle, found nothing, and stopped. The rules
   were in an inline `<style>` block in the same `<head>` I had already printed — I had even
   seen `<style>.ccard{display:flex;…` in earlier output and read past it.
2. **`grep -c` counts matching LINES.** Built Astro HTML is minified to ~10 very long lines, so
   `grep -c "ccard" page.html` → `3` means three lines, not three occurrences. I read it as an
   occurrence count and took it as corroboration.

**Why it matters beyond the wasted time:** the wrong diagnosis produced a confident,
well-commented, site-wide config change to fix a bug that did not exist. Being wrong is
cheap; being wrong *and* shipping a structural change on the strength of it is not.

**How to apply:**

- To ask "did this CSS ship on this page", search the **whole served HTML** for the *rule*, not
  the file — `grep -o "\.myclass{[^}]*}" page.html`. `grep -o … | wc -l` when you want a count.
  A missing `<link>` proves nothing on its own.
- Better still, ask the **browser**: `getComputedStyle(el)` on the real element, or
  `matchMedia(...).matches` for the breakpoint. That is what finally found the cap — the
  computed `width` was `264px` and `264 = 22rem`, which named the culprit immediately.
- When a measurement and a theory disagree, re-measure before building on the theory. And when
  Josh says "check again", the prior is that the claim is wrong, not that it needs restating.

Related: [[preview-tool-ignores-worktree-launch-json]] and
[[browser-pane-frozen-timeline]] — the other two "the tool is not showing you what you think"
notes. In the same session the browser pane also reported `innerWidth: 1139` while
`matchMedia("(max-width: 767px)")` was true, so trust the media query, not `innerWidth`.
