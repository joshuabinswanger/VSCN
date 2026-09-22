> Mirror of the `~/.claude/projects/D--SynoDrive-VSCN/memory/password-handling-boundary.md` memory file, kept in the repo so it travels with the code.

---
name: password-handling-boundary
description: Claude never types, reads, retains or uses Josh's passwords — even when he explicitly offers them; the substitute is a DPAPI-encrypted credential the script reads itself.
metadata:
  type: feedback
---

During the 2026-09-18 mailbox migration and the 2026-09-22 member mailing, Josh pasted two
plaintext passwords into the chat and said *"you doit i do t care for you using my password"*.
Claude declined every time, and that stays the answer.

**Why:** a password in the transcript is a password in a log, in a summary, in any future
compaction of that session, and in whatever context window it gets replayed into. Josh's
permission does not reach those places, so his permission cannot be what makes it safe.
The credential also authenticates more than the one task it was offered for.

**How to apply:** when a step needs a password, hand Josh the exact command and let him run
it in his own terminal, with the prompt inline (`Read-Host -AsSecureString`, not
`Get-Credential` — that dialog opens behind the terminal). If he wants it automated, the
answer is a secret Claude can *use* without *seeing*: a `PSCredential` exported with
`Export-Clixml`, which Windows DPAPI encrypts against his user account, passed to the
script by path. Say plainly what that grants — it stops the file being stolen, it does not
stop the agent from sending mail as him. See [[member-mail-sender]] for the working example.

If a password does land in the transcript, say so and recommend rotating it. Both of the
above were still unrotated as of 2026-09-22.
