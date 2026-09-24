> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/bilingual-profile-role-bio.md` memory file; keep the two in sync.

---
name: bilingual-profile-role-bio
description: roleDe/bioDe on dev (PR #74 f68cac4, #77 f3711d0), labelled ready-for-release 2026-09-24, not on prod yet; fallback runs BOTH ways unlike image captions
metadata:
  type: project
---

Profile `role`/`bio` gained optional German twins `roleDe`/`bioDe` (member feedback "Alles sollte zweisprachig sein"). MERGED TO DEV `f68cac4` via PR #74 on 2026-09-23 and deployed by CI; **not on prod**. Josh cleared both PRs for release on 2026-09-24 (label `ready-for-release`).

- One resolution point: `localizeMember(m, lang)` in `src/lib/memberView.ts`, called by each page right after `fetchMemberViews()`. Renderers read plain `role`/`bio`/`caption` only, so a new surface that skips `localizeMember` silently shows English on /de.
- The fallback is **bidirectional** (`profileRole`/`profileBio` in `src/lib/links.ts`), deliberately unlike `pickLocaleText` for image captions, which only falls back de→en. A German-only member must not vanish from English pages.
- Editors show each field behind the gallery's EN/DE switch (`src/components/BilingualField.astro`, PR #77 `f3711d0`, Josh: "make it the same switch as with the images"). Visible label is neutral; "(English)/(German)" live in the controls' aria-labels. Ids unchanged (`role`/`role-de`, `bio`/`bio-de`, `ob-*`). Still unwalked: a real signed-in save on dev.

**Why:** a prod release must ship rules before Hosting, or `hasOnly` refuses every save that carries `roleDe` (see [[firestore-rules-hasonly-gotcha]], [[ci-deploys-security-rules]]).
**How to apply:** when releasing to prod, confirm the rules deploy precedes hosting. The worst-case budget test in `tests/rules/firestore.test.mjs` now carries the German pair plus `receiveCommunityEmails`/`preferredLanguage`, so re-run it when adding any `users/{uid}` field ([[rules-evaluation-budget]]).
