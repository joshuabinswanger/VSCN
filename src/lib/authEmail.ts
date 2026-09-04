// WHERE AN AUTH EMAIL SENDS SOMEONE AFTERWARDS.
//
// Firebase's auth emails (password reset, email verification, change-email
// confirmation) carry a link to an "action handler" page. Until 2026-09-03
// every one of ours was sent with no ActionCodeSettings at all, which has two
// consequences that only show up from the member's side:
//
//   1. The link carries no `continueUrl`, so the handler has nowhere to send
//      the member when it finishes. Firebase's own generic handler shows a
//      bare confirmation and stops — the member is done, signed out, on a
//      page with no way back to the site.
//   2. Our own /auth/action page had to GUESS the destination, so it hard-coded
//      one per mode. That is wrong whenever the same email is sent from two
//      places: verification sent during onboarding should return to
//      onboarding, the same email resent from the profile editor should return
//      to the profile.
//
// So every send site now names its own return destination, and /auth/action
// honours it. `continueUrl` is the only part of the link we can influence from
// here — the handler page itself is project config, and on dev that config is
// locked (see scripts/set-auth-action-url.mjs), which is exactly why #1 bites
// hardest there: dev's emails go to Firebase's page, and a `continueUrl` is
// the ONLY thing that puts a way back on it.
import type { ActionCodeSettings } from "firebase/auth";

/**
 * Where to send a member after they finish an emailed action.
 *
 * Paths are site-absolute and locale-LESS ("/profile"): the locale prefix is
 * added here so callers pass the same string in both languages. The origin
 * comes from the running page rather than an env var, so a link generated on
 * dev returns to dev and one generated on prod returns to prod, with nothing
 * to keep in sync.
 *
 * `handleCodeInApp` stays false — these are web flows, and true would ask
 * Firebase to route through a mobile app we do not have.
 */
export function returnTo(lang: string, path: string): ActionCodeSettings {
  const prefix = lang === "de" ? "/de" : "";
  return { url: new URL(prefix + path, window.location.origin).toString(), handleCodeInApp: false };
}

/**
 * A `continueUrl` off an incoming action link, as a path this site can
 * navigate to — or null when there is nothing usable.
 *
 * Same-origin is enforced, not cosmetic: `continueUrl` arrives in the query
 * string of a link that has been through an email client, and an off-site
 * value would turn our success button into an open redirect. A rejected value
 * falls back to the caller's default rather than failing the flow, because the
 * member has at that point already reset their password — the destination is
 * the least important thing left.
 */
export function continueTarget(): string | null {
  const raw = new URLSearchParams(window.location.search).get("continueUrl");
  if (!raw) return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}
