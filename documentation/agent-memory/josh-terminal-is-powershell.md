<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/josh-terminal-is-powershell.md — kept in sync so any Claude instance can read it without the user profile. -->

---
name: josh-terminal-is-powershell
description: Josh's terminal is Windows PowerShell 5.1 — never hand him bash syntax; &&, VAR=x, $(...) assignment and [ ] tests all fail there
metadata:
  type: feedback
---

**STANDING RULE, set by Josh 2026-09-07: write his commands for PowerShell.**
He chose this after the alternatives were laid out, so do not re-litigate it or
offer bash workarounds again. Just write PowerShell.

Every command written for Josh to run himself must be **Windows PowerShell 5.1**,
not bash. His prompt is `PS D:\SynoDrive\VSCN\repo>`. My own Bash tool runs Git
Bash, which is a DIFFERENT shell from the one he types into — so a command that
works for me can be a parser error for him.

**Why:** on 2026-09-07 I gave him a one-liner chained with `&&`. PowerShell 5.1
has no `&&`/`||`, so it failed to parse; the unbalanced quote then left him at a
`>>` continuation prompt, and the whole line echoed back at him repeatedly. He
had to ask how to run it at all.

**How to apply:** prefer ONE command with no chaining, and do the verification
myself afterwards with my own tools rather than building it into his line. When
chaining is unavoidable:

| bash | PowerShell 5.1 |
| --- | --- |
| `a && b` | `a; if ($?) { b }` |
| `a; b` | `a; b` (same) |
| `VAR=x` | `$VAR = x` |
| `[ "$a" = "$b" ]` | `if ($a -eq $b)` |
| `$(cmd)` | `$(cmd)` (this one is the same) |
| `dev^{tree}` | `'dev^{tree}'` — quote it, the braces confuse the parser |

Also: `2>&1` on a native exe wraps stderr in ErrorRecords and flips `$?` to
false even on exit 0, and `Set-Content` defaults to ANSI — pass `-Encoding utf8`.

Ctrl+C escapes a stuck `>>` prompt.

## The panel cannot be switched to bash, and bash-from-PowerShell is a trap

Checked 2026-09-07. **No setting exists** to change the desktop app's terminal
panel shell — it follows the OS default, which is PowerShell on Windows. The
`defaultShell` setting that does exist applies only to the `!` prefix in
terminal-mode Claude Code, not to this panel. The app also **does not read
PowerShell profiles**, so a `function bash { ... }` in `$PROFILE` will NOT load
in the panel (and his `$PROFILE` does not exist yet anyway). I suggested that
route before checking; it was wrong.

Git Bash IS installed, bash 5.3.9, at BOTH `C:\Program Files\Git\bin\bash.exe`
and `C:\Program Files\Git\usr\bin\bash.exe`. Bare `bash` is NOT it — that
resolves to `C:\WINDOWS\system32\bash.exe`, the WSL launcher, and he has no
distro, so it exits silently with no output at all.

**Do not hand him `bash -c '<script>'` to run from PowerShell.** PowerShell 5.1
re-parses native-exe arguments and mangles nested `$( )` containing spaces.
Verified: `bash -c 'cd /d/...; echo "branch=$(git branch --show-current)"'` dies
with "unexpected EOF while looking for matching )" in BOTH binaries, while
`bash -c 'echo one; echo two'` is fine. Simple scripts survive; command
substitution does not.

**The working route** is an INTERACTIVE Git Bash, where no PowerShell quoting
sits in the middle: the Git Bash app from the Start menu, or
`& "C:\Program Files\Git\bin\bash.exe" -l` from the panel. Then bash syntax
works as written.

Related: [[deploy-dev-needs-development-mode]] (the firebase CLI there needs the
full `node.exe` path for an unrelated reason — a stub global `node` package).

## `!` in the CHAT INPUT BOX already runs bash

Read out of the installed `claude.exe` settings schema on 2026-09-07, so this is
authoritative for his version:

    defaultShell: enum(["bash","powershell"]).optional()
      "Default shell for input-box ! commands.
       Defaults to 'bash' on all platforms (no Windows auto-flip)."

So the `!` prefix typed in the **chat input box** (not the terminal panel) runs
in **bash already**, with no configuration. That is the way to give Josh a bash
command in this app: `!git merge -s ours origin/main -m "..."`. The key lives in
`~/.claude/settings.json`; his does not set it, so it sits at the bash default.

`CLAUDE_CODE_GIT_BASH_PATH` is also real — it points Claude Code at a bash
binary, validates the basename is one of bash.exe/sh.exe/bash/sh, and falls
back to auto-detection (which finds `C:\Program Files\Git\bin\bash.exe`). Only
needed if Git Bash moves.

**The panel and the input box are different shells.** Panel = PowerShell,
unchangeable. Input box `!` = bash. Say which one a command is for.

## The panel's shell cannot be changed by any system setting

Asked and settled 2026-09-07. Windows has no user-settable "default shell" for
an embedded terminal the way Unix has `$SHELL`, and this app does not read one:
the binary locates PowerShell among "fixed absolute candidates"
(`\PowerShell\7\pwsh.exe`, `\powershell.exe`) rather than from a variable.
Setting `SHELL` or `COMSPEC` will not flip it — the app *itself* overwrites
`process.env.SHELL` with the Git Bash path on Windows, for its own BashTool
("Using bash path: ..." / "Git Bash not found; BashTool will be unavailable").

The app carries both a `{type:"powershell"}` and a `{type:"bash"}` shell
provider, but the only knob it exposes is `defaultShell`, and that governs the
input-box `!` prefix alone. So: panel = PowerShell, permanently.
