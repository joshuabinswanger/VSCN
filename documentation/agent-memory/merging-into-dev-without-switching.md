> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/merging-into-dev-without-switching.md` memory file; keep the two in sync.

---
name: merging-into-dev-without-switching
description: "How to merge a feature branch into dev locally when repo/ must not be switched: a throwaway DETACHED worktree at origin/dev, merge, push HEAD:refs/heads/dev. Plus the three things that bite — relative paths under git -C, no .env in a raw worktree, and TaskStop leaving an astro child that locks the directory"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 407c1e47-3fdf-4ad3-bbf4-dae6ee0671e6
  modified: 2026-09-08T09:26:14.835Z
---

`repo/` is shared by several Claude sessions and must never be switched ([[concurrent-session-stash-hazard]]),
and git refuses to check out `dev` in a second worktree while `repo/` holds it. So a local
merge into `dev` has nowhere obvious to happen. It happens in a throwaway **detached** worktree:

```
git -C <abs repo path> worktree add --detach <ABSOLUTE sibling path> origin/dev
cd <that path> && git merge --no-edit feat/thing
git commit --amend -m "Merge branch 'feat/thing' into dev"   # else the message says "into HEAD"
# ...run the gates here, on the MERGED tree...
git push origin HEAD:refs/heads/dev                          # fast-forward, no local dev needed
```

Parent order comes out right: the detached HEAD (dev's content) is first parent, the feature
second — the same shape GitHub's "Merge pull request" commits have. The push is a plain
fast-forward, so it is refused rather than forced if `dev` moved under you; check first with
`git merge-base --is-ancestor origin/dev HEAD`. `repo/`'s own `dev` pointer is left stale on
purpose — another session owns that checkout, and it will fast-forward on its next pull.
Afterwards the branch is safe to `git branch -D` once `git merge-base --is-ancestor
feat/thing origin/dev` says yes; `-d` would refuse, because it judges against `repo/`'s
stale HEAD rather than the remote.

**Three things that bit, in order (2026-09-08):**

1. `git -C repo worktree add --detach wt-tmp origin/dev` resolved `wt-tmp` **inside** `repo/`,
   not beside it — `-C` moves git's cwd, so a relative path follows it. Pass an absolute path.
2. A raw `git worktree add` has no `.env` (gitignored), so `npm run build` printed
   `FIREBASE_SERVICE_ACCOUNT env var not set` and built a member-less community page while
   still saying Complete — the documented worktree trap, and the reason `npm run worktree`
   exists. `cp` the env files in before trusting a build. `node_modules` can be symlinked at
   `repo/node_modules`; `functions/node_modules` needs its own link or install.
3. `TaskStop` on a backgrounded `npm run dev` killed the npm wrapper and **left the astro
   child running**, which held a Windows handle on the worktree directory: removal failed with
   `EPERM` / `Device or resource busy`, and both `npm run worktree -- <b> --remove` and
   `git worktree remove --force` half-finished — git deregistered the worktree while the
   directory survived as a husk. Find the survivor by command line
   (`Get-CimInstance Win32_Process | ? CommandLine -like '*<worktree>*'`), stop it, then
   delete the husk. A backgrounded dev server needs its child killed, not just its wrapper.
