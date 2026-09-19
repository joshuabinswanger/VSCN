# Communication preferences

Private `users/{uid}` fields:

- `receiveCommunityEmails?: boolean`: true opts into optional community emails; false opts out; absent preserves an existing member's unknown choice.
- `correspondenceLanguage?: "de" | "en"`: defaults to German when missing; independent of site locale and public working languages.

Onboarding asks on the community-goals step, with emails unchecked and German selected. Moving to the next step requires the preference write to succeed. The Profile Account tab allows later changes. Saving unrelated profile details preserves an absent email preference.

Both fields are excluded from the public-profile type and projection. The private Firestore validator accepts the optional boolean and closed language enum on both create and update. The public allowlist rejects both fields.

There is no community-mail sender in the application. `node scripts/export-community-mailing.mjs -P dev` (or `-P prod`) prints a read-only recipient table, including correspondence language. Only explicit opt-ins with an email and no pending account deletion are included; unknown values never count as consent. Generate a fresh list before each mailing so later opt-outs are respected. The volunteer report keeps all volunteers and displays their email preference and correspondence language separately.

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