/**
 * The member's stored language is also their site language.
 *
 * `users/{uid}.preferredLanguage` is one setting for two things — the locale the
 * site routes a signed-in member to, and the language VSCN mails them in. The
 * routing is deliberately narrow, and each limit is load-bearing:
 *
 * - It only happens on /profile, which is also where sign-in lands. Never on a
 *   public page: a member following a shared /de/ link to someone's gallery is
 *   not bounced to the English copy of it.
 * - An absent preference never redirects. Absent means "never chosen", and
 *   guessing from it would drag every historic member to one locale.
 * - Any explicit EN / DE choice on this visit switches the routing OFF for the
 *   rest of the session (sessionStorage, so per tab and gone when it closes):
 *   the Navbar switch, and the editor's own language setting on Save. That is
 *   stricter than "never route against a click". A choice that AGREES with the
 *   stored preference also stops it, so a member who picked DE and then
 *   hand-types /profile in the same tab stays on the English page; a new tab
 *   routes again. The strictness is what keeps Back working: after the DE
 *   switch takes a member from /profile to /de/profile, Back to /profile would
 *   otherwise be routed straight forward again. (The editor's Save leaves no
 *   such entry behind: it navigates with location.replace.) Both writers also store the preference when the
 *   member is signed in (Navbar.astro, profileEditorController.ts), but the
 *   session record is what guarantees we never route against a click, even if
 *   that write fails or the member was signed out when they made it.
 *
 * Dependency-free on purpose: tests/unit imports it directly.
 */

export type SiteLanguage = "de" | "en";

export const SESSION_CHOICE_KEY = "vscn.siteLanguageChoice";

export function isSiteLanguage(value: unknown): value is SiteLanguage {
  return value === "de" || value === "en";
}

/** The same page in the other locale. English is unprefixed, German is /de. */
export function localePath(pathname: string, lang: SiteLanguage): string {
  const bare = pathname.replace(/^\/de(?=\/|$)/, "") || "/";
  if (lang === "en") return bare;
  return bare === "/" ? "/de" : `/de${bare}`;
}

/**
 * Where a signed-in member belongs, or null to stay put. `explicit` is this
 * session's EN / DE choice, if any: any choice at all, agreeing with the
 * stored preference or not, means null (see the module comment for why).
 */
export function preferredLocaleTarget(
  stored: unknown,
  current: SiteLanguage,
  pathname: string,
  explicit: SiteLanguage | null,
): string | null {
  if (explicit) return null;
  if (!isSiteLanguage(stored) || stored === current) return null;
  return localePath(pathname, stored);
}

export function readSessionChoice(): SiteLanguage | null {
  try {
    const value = sessionStorage.getItem(SESSION_CHOICE_KEY);
    return isSiteLanguage(value) ? value : null;
  } catch {
    return null;
  }
}

export function rememberSessionChoice(lang: SiteLanguage): void {
  try {
    sessionStorage.setItem(SESSION_CHOICE_KEY, lang);
  } catch {
    // Storage blocked: the stored preference still gets written when signed in.
  }
}
