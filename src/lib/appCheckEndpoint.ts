// Pure: no Firebase, no DOM, so plain `node --test` can exercise it.
//
// Where the browser sends a Turnstile token to be swapped for an App Check
// token. Two answers, chosen by the page's own hostname at runtime:
//
//   localhost   → the Cloud Function's own URL on cloudfunctions.net (CORS).
//                 There is no Firebase Hosting in front of `astro dev`.
//   anywhere    → same-origin `/api/app-check`, a Hosting rewrite to the same
//                 function. Same-origin is the point: after the move away from
//                 reCAPTCHA (documentation/20260907-turnstile-app-check-provider.md)
//                 the login path should touch as few third-party hosts as
//                 possible, because institutional web filters block Google
//                 hosts by category. This keeps `cloudfunctions.net` off the
//                 list; a filter cannot block it without blocking vscn.ch.
//
// Decided by hostname rather than by import.meta.env.DEV on purpose: the dev
// SITE is built with `--mode development` too (see deploy:dev), and it sits
// behind Hosting just like prod, so it wants the same-origin route.
export const MINT_PATH = "/api/app-check";
export const MINT_FUNCTION = "mintAppCheckToken";
export const MINT_REGION = "us-central1";

export function mintEndpointFor(hostname: string, projectId: string): string {
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `https://${MINT_REGION}-${projectId}.cloudfunctions.net/${MINT_FUNCTION}`;
  }
  return MINT_PATH;
}
