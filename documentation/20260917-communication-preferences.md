# Communication preferences

Private `users/{uid}` fields:

- `receiveCommunityEmails?: boolean`: true opts into optional community emails; false opts out; absent preserves an existing member's unknown choice.
- `preferredLanguage?: "de" | "en"`: the member's site language AND email language (see below). Absent means never chosen: no redirect, and mail exports fall back to German. Independent of the public working languages. Named `correspondenceLanguage` until 2026-09-23; no document ever held that name, because no deployed ruleset accepted it.

Onboarding asks on the community-goals step, with emails unchecked and the page's own locale selected. Moving to the next step requires the preference write to succeed. The Profile Account tab allows later changes. Saving unrelated profile details preserves an absent email preference.

Both fields are excluded from the public-profile type and projection. The private Firestore validator accepts the optional boolean and closed language enum on both create and update. The public allowlist rejects both fields.

There is no community-mail sender in the application. `node scripts/export-community-mailing.mjs -P dev` (or `-P prod`) prints a read-only recipient table, including preferred language. Only explicit opt-ins with an email and no pending account deletion are included; unknown values never count as consent. Generate a fresh list before each mailing so later opt-outs are respected. The volunteer report keeps all volunteers and displays their email preference and preferred language separately.

Account/security emails and admin signup notifications are unaffected. No backfill or production data write is required.

Release ordering: deploy the new Firestore rules before or with the frontend; the previous field allowlist rejects these new preferences. This change does not itself deploy rules or hosting.

Validation: lint; Astro diagnostics (0 errors, 0 warnings, one pre-existing unused-variable hint); unit tests; Functions TypeScript compilation; Firestore/Storage/Functions emulator tests; static build using a local empty directory fixture rather than live member data.

Scoped rules audit:

```json
{
  "score": 5,
  "summary": "The added communication fields remain private; owner authorization and lifecycle restrictions are unchanged; create and update share the same strict validator. Tests cover malformed preferences and rejection in public profiles.",
  "findings": []
}
```
## 2026-09-23: one setting for site and email language

Member feedback: "Account sollte präferierte Sprache speichern". The stored language now also routes the site. Rules for that are in `src/lib/siteLanguage.ts` and tested in `tests/unit/siteLanguage.test.mjs`:

- **Only /profile routes**, and sign-in lands there. Public pages never redirect, so a shared `/de/` link opens in German for everyone.
- **Absent never routes.** Guessing would drag every historic member to one locale.
- **The EN / DE switch wins.** A click records the choice in `sessionStorage` (per tab, for this visit), and /profile never routes against it. When the member is signed in, the click also writes `preferredLanguage` (`savePreferredLanguage`, an `updateDoc` so nobody mid-signup gets a stub record). The session record is what protects the click if that write fails, or if the member was signed out when they made it.
- **Saving a different language in the editor** is just as explicit, so the page moves to that locale straight after the save.

**Why one setting, not two.** Keeping separate site and email languages would add a second field for a distinction no member has asked for, plus editor copy explaining how the two differ. It would also let the stored "site language" and the language the member actually reads the site in drift apart. The editor says plainly that the one setting governs both and that the header switch changes it. The working-languages note points there, so the public languages field is not mistaken for it.
