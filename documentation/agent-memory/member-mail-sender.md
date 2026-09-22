> Mirror of the `~/.claude/projects/D--SynoDrive-VSCN/memory/member-mail-sender.md` memory file, kept in the repo so it travels with the code.

---
name: member-mail-sender
description: How to re-send a plain-text mail to VSCN members from info@vscn.ch — the script, the anti-Promotions rules, the PowerShell traps, and the DPAPI credential that lets Claude run it unattended.
metadata:
  type: project
---

The gallery invitation went out 2026-09-22 to 19 members who had no gallery images
(Karin Seiler removed by hand). The apparatus is reusable for any future member mailing.

## The three files

They live in `C:\Users\Josh\.vscn\mail\`. Josh moved them there himself on 2026-09-22,
out of a session scratchpad that would have been cleaned. The body is also inlined at the
bottom of this note in case the folder is ever lost.

- `send-invites.ps1` — the sender. `-Test` (one mail to info@rhizome.ch) or `-Send -Yes`
  (everyone in the CSV). Also `-To <addr>` and `-CredentialPath <file>`.
- `mail-body.txt` — the German body, UTF-8, with a single `{ANREDE}` placeholder.
- `brevo-contacts.csv` — `EMAIL,ANREDE,NAME`. Real member addresses: keep it out of the repo.

## Why plain text, one mail per person

Gmail put every earlier attempt in the Promotions tab. What keeps it out of there is the
*combination*: no HTML, no ESP, no tracking pixel, no link redirector, no unsubscribe
footer, no shared bulk IP. Sent one-to-one straight through the real Infomaniak mailbox
(`mail.infomaniak.com:587`, STARTTLS, `Send-MailMessage -UseSsl`), 3 s apart.
The cost is that a plain-text mail cannot put a link on a word, so URLs stand as themselves.

## The credential, and how Claude can run this unattended

`-CredentialPath` reads a `PSCredential` exported with `Export-Clixml`. That file is
encrypted by Windows DPAPI against Josh's user account: only a process running as him on
that machine can decrypt it, and the plaintext never enters the transcript or the agent's
context. Created once, by Josh, never by Claude:

    Get-Credential -UserName 'info@vscn.ch' | Export-Clixml C:\Users\Josh\.vscn\smtp-vscn.cred

**It exists, and it works.** Proven 2026-09-22 by a real test send:

    & 'C:\Users\Josh\.vscn\mail\send-invites.ps1' -Test -CredentialPath 'C:\Users\Josh\.vscn\smtp-vscn.cred'

printed `credential: info@vscn.ch / 16 characters` and `1/1 accepted by the server.`
`-Send -Yes` in place of `-Test` is the real mailing.

**What that actually grants:** DPAPI protects against the file being stolen, not against
the agent. Once it exists, any session with a shell on that machine can send mail as VSCN.
Claude still asks before any bulk send, but that is a promise, not a technical limit.
Claude does not handle the password itself under any circumstance — see
[[password-handling-boundary]].

## Traps, all of them paid for

- **Never hard-wrap the body.** One long line per paragraph, no leading indentation.
  Wrapping at 72 columns looked right on desktop and made a staircase of ragged
  remainders on the phone, because Gmail re-wraps the already-wrapped lines. Indented
  lines are worse still: the continuation returns to column 0 and the block visibly jumps.
- **`send-invites.ps1` must stay ASCII-only.** Windows PowerShell 5.1 misreads a UTF-8
  script with no BOM. All German lives in `mail-body.txt`, read with `-Encoding UTF8`,
  and the send uses `-Encoding ([System.Text.Encoding]::UTF8)`.
- **Parse it before a live run:** `[System.Management.Automation.Language.Parser]::ParseFile`.
- **The password-length echo is the cheap typo check.** The script prints the character
  count; the real one is 16. A failed run had caught 17.
- **`Read-Host -AsSecureString`, not `Get-Credential`,** when prompting: the credential
  dialog is a separate window and opens behind the terminal often enough to look dead.
- **Repeated test sends to the same address collapse in Gmail** — same subject threads
  them, the repeated body reads as a quotation, and you get a "•••" trimmed marker and a
  quote bar. A test artifact only. Do *not* "fix" it by putting a timestamp in the
  subject; that was tried and rejected.
- **Never re-run after a partial failure** without trimming the CSV — the recipients that
  already succeeded get the mail twice.

## Writing the German

Josh writes the German himself. Claude's job is correction, not authorship: fix spelling
and grammar, flag anything beyond that, offer to revert. The mail is singular-Du
throughout with capitalised Du/Dein — watch for a drift into the plural Ihr-form.
"Galerie", not the English "Gallerie". Swiss spelling: grosser, not großer.

`?pattern=spread` on the community URL is load-bearing — without it the page shows the
Index, not the gallery. See [[community-default-view-index]].

The tips describe the real editor fields (see [[image-descriptions-long-and-short]]):
`caption` is one line and doubles as the alt text, `description` carries the context.

## Open

- `Wong Chi Lui` is addressed as "Liebe Lui"; the given name may be "Chi Lui" and the
  gendered salutation was never verified. Asked three times, never answered.
- The footer block ("Du bekommst diese Mail, weil…") was never signed off either way.

## The body, as sent 2026-09-22

Subject: `VSCN - Erstelle jetzt Deine Galerie`
From: `Joshua Binswanger (VSCN) <info@vscn.ch>`

    {ANREDE},

    schön, dass Du Teil unserer Community und eines unserer ersten Mitglieder bist!

    Bei VSCN gibt es nun eine Bildergalerie:
    https://vscn.ch/de/community?pattern=spread

    Wir würden uns sehr freuen, auch Deine Arbeiten dort zu zeigen. Je mehr Mitglieder ihre Bilder teilen, desto mehr gibt es zu entdecken – und unser Beitrag zur Wissenschaftskommunikation bekommt mehr Sichtbarkeit!

    Du kannst Deine Bilder direkt in Deinem Profil hochladen:
    https://vscn.ch/de/profile

    Drei Tipps für Deine Galeriebilder:

    • Caption & Bildbeschreibung:
    Die Caption ist eine Zeile: was ist zu sehen, und womit gemacht. Sie wird auch als Alt-Text für Screenreader verwendet. In der Bildbeschreibung ist Platz für den Kontext – für welches Projekt die Darstellung entstanden ist, was sie zeigt und worauf Du bei der Gestaltung geachtet hast.

    • Link:
    Verlinkungen zur Projektseite in Deinem Portfolio oder zur Publikation – so lässt sich Deine Arbeit im Zusammenhang entdecken, und es hilft der Search Engine Optimization (SEO).

    • Tags:
    Sie helfen anderen, Deine Bilder nach Themen und Techniken zu finden, und zeigen, wie vielfältig unsere Community arbeitet.

    Bereits ein oder zwei Deiner Arbeiten sind ein grosser Beitrag zu unserer kleinen Community!

    Wenn Du Fragen hast oder beim Hochladen Hilfe brauchst, melde Dich gerne. Wir freuen uns auf Deine Arbeit!

    Liebe Grüsse
    Joshua

    PS: Wir freuen uns auch über jeden Verbesserungsvorschlag und Feature-Wunsch, deswegen zögere nicht, Dich zu melden!

    --
    VSCN – Visual Science Communication Network, vscn.ch
    Du bekommst diese Mail, weil Du ein Mitgliederprofil bei VSCN hast. Wenn Du solche Hinweise nicht mehr möchtest, antworte einfach kurz.

(The four-space indent above is this note's formatting only — the real `mail-body.txt` has
no indentation at all. That is the point of the wrapping trap above.)

Related: [[email-mailbox-migration]] (how the mailbox got to Infomaniak),
[[josh-terminal-is-powershell]], [[signup-notification-and-legal-pages]].
