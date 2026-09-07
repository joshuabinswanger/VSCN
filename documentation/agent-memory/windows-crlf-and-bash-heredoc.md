> Mirror of the `~/.claude/projects/D--SynoDrive-VSCN-repo/memory/windows-crlf-and-bash-heredoc.md` memory note, kept in the repo so any Claude instance can read it without access to Josh's user profile. Keep both copies in sync.

---
name: windows-crlf-and-bash-heredoc
description: Working-tree files are CRLF on Josh's machine (core.autocrlf true) and the Bash tool's heredocs fail here; exact-string patch scripts must normalise line endings and be written with the Write tool
metadata:
  type: project
---

On Josh's Windows checkout `git config core.autocrlf` is `true`, so every tracked text file
is LF in the index and **CRLF on disk** (`git ls-files --eol` shows `i/lf w/crlf`). Git Bash's
`grep -c $'\r'` reports 0 and `od -c` shows `\n` because they normalise on read, so the CRLF is
invisible to the usual checks; `file` does report it.

Separately, a multi-line `cat > file <<'EOF'` heredoc through the Bash tool died with
"unexpected EOF while looking for matching `''" (2026-09-07) even with a quoted delimiter and no
stray terminator.

**Why:** an exact-string replacement script that matches against LF text finds 0 matches on the
CRLF file and looks like a wrong quote, not a line-ending problem. Half an hour was spent on it.

**How to apply:** write helper scripts with the Write tool into the scratchpad, not via a Bash
heredoc. In any patch script, strip `\r\n` to `\n` before matching and restore CRLF when writing
back. Serena's `replace_content` resolves paths against `repo/`, not the active worktree, so do
not use it to edit a `wt-*` worktree. See [[concurrent-session-stash-hazard]] for why the
worktree matters.
