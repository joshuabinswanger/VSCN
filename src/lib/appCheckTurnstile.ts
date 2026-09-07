// App Check attested by Cloudflare Turnstile instead of Google reCAPTCHA.
//
// WHY (2026-09-07, documentation/20260907-turnstile-app-check-provider.md): a
// member on an institute network could not sign in because the network blocks
// www.google.com/recaptcha, and prod ENFORCES App Check on Auth and Firestore.
// Most members are expected on exactly such networks (ETH, UZH, ...), which
// block Google hosts by category far more often than Cloudflare's challenge
// host. So the attestation is Turnstile, fed to Firebase through App Check's
// CustomProvider: the page solves a Turnstile challenge, POSTs the token to
// our own Cloud Function (functions/src/appCheck.ts), which verifies it with
// Cloudflare and mints a real App Check token with the Admin SDK. Enforcement
// in the Firebase console is untouched.
//
// Two lessons from the reCAPTCHA era are built in:
//
//   1. The script tag is OURS, with an `error` listener. The SDK's reCAPTCHA
//      loader registered only `onload`, so a blocked script left App Check
//      pending forever and Auth reported its own 30 s timeout as a network
//      error. Here a blocked script flips isSecurityCheckBlocked() at once,
//      and the forms refuse before calling Auth.
//   2. Every wait here has a deadline shorter than Auth's 30 s, so whatever
//      goes wrong is reported as what it is, not as "could not reach the
//      server".
//
// The mint call is a plain fetch and MUST stay one. httpsCallable asks App
// Check for a token before every call, and App Check would at that moment be
// waiting on this very function: a deadlock, not a recursion error.
import { CustomProvider, type AppCheckToken } from "firebase/app-check";
import { mintEndpointFor } from "./appCheckEndpoint.ts";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SLOT_ID = "turnstile-slot";
const ACTION = "app-check";
/** How long the script may take to arrive before we call it blocked. */
const SCRIPT_DEADLINE_MS = 20_000;
/** How long one challenge may take, interaction included, before we give up. */
const CHALLENGE_DEADLINE_MS = 25_000;

/** The subset of Cloudflare's `turnstile` global that this module uses. */
interface TurnstileApi {
  render(container: HTMLElement | string, params: Record<string, unknown>): string | undefined;
  execute(widgetId: string): void;
  reset(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptFailed = false;
let scriptReady: Promise<TurnstileApi> | null = null;
let widgetId: string | null = null;
let pending: { resolve: (token: string) => void; reject: (err: Error) => void } | null = null;

/** True once the Turnstile script has failed to load on this page. */
export function isSecurityCheckBlocked(): boolean {
  return scriptFailed;
}

function loadScript(): Promise<TurnstileApi> {
  if (scriptReady) return scriptReady;
  scriptReady = new Promise<TurnstileApi>((resolve, reject) => {
    if (window.turnstile) {
      resolve(window.turnstile);
      return;
    }
    const tag = document.createElement("script");
    tag.src = SCRIPT_SRC;
    tag.async = true;
    tag.addEventListener("load", () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("turnstile script loaded but defined no global"));
    });
    tag.addEventListener("error", () => {
      scriptFailed = true;
      console.warn("Cloudflare Turnstile script failed to load; App Check cannot attest this page");
      reject(new Error("turnstile script blocked"));
    });
    document.head.appendChild(tag);
  });
  return scriptReady;
}

function withDeadline<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} after ${ms} ms`)), ms);
    work.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

// Layout.astro carries the slot (fixed, bottom-right, transition:persist so
// the view-transition router does not throw the widget away between pages).
// Creating one here is the fallback for a page that does not use the layout.
function slot(): HTMLElement {
  let el = document.getElementById(SLOT_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = SLOT_ID;
    el.className = "turnstile-slot";
    document.body.appendChild(el);
  }
  return el;
}

function settle(fn: (p: NonNullable<typeof pending>) => void): void {
  const p = pending;
  pending = null;
  if (p) fn(p);
}

/**
 * Run one Turnstile challenge and resolve with its token. The widget is
 * rendered once, in `execute` mode, so nothing runs until asked; each call
 * resets it and runs it again, because a Turnstile token is single-use and
 * lives five minutes, while App Check re-attests about hourly.
 */
async function challenge(siteKey: string): Promise<string> {
  const turnstile = await withDeadline(loadScript(), SCRIPT_DEADLINE_MS, "turnstile script did not load");
  if (!widgetId) {
    widgetId =
      turnstile.render(slot(), {
        sitekey: siteKey,
        action: ACTION,
        // Nothing is rendered until Cloudflare decides it needs a click, and
        // nothing runs until execute() below. Managed mode (set on the widget
        // in the Cloudflare dashboard) then shows a checkbox rather than
        // failing silently, which is why it was chosen over Invisible.
        execution: "execute",
        appearance: "interaction-only",
        theme: "light",
        callback: (token: string) => settle((p) => p.resolve(token)),
        // Returning true tells Turnstile the error is handled, so it does
        // not also paint its own error state into the slot.
        "error-callback": (code: string) => {
          settle((p) => p.reject(new Error(`turnstile error ${code}`)));
          return true;
        },
        "timeout-callback": () => settle((p) => p.reject(new Error("turnstile challenge timed out"))),
        // A token we already used, or never used, expired: nothing to do, the
        // next execute() mints a fresh one.
        "expired-callback": () => {},
      }) ?? null;
    if (!widgetId) throw new Error("turnstile widget did not render");
  }
  const id = widgetId;
  const token = new Promise<string>((resolve, reject) => {
    settle((p) => p.reject(new Error("turnstile challenge superseded")));
    pending = { resolve, reject };
    try {
      turnstile.reset(id);
      turnstile.execute(id);
    } catch (e) {
      settle((p) => p.reject(e instanceof Error ? e : new Error(String(e))));
    }
  });
  return withDeadline(token, CHALLENGE_DEADLINE_MS, "turnstile challenge did not finish");
}

async function mint(turnstileToken: string, projectId: string): Promise<AppCheckToken> {
  const res = await fetch(mintEndpointFor(location.hostname, projectId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: turnstileToken }),
  });
  if (!res.ok) {
    const why = await res.text().catch(() => "");
    throw new Error(`app check mint refused: ${res.status} ${why}`.trim());
  }
  const body = (await res.json()) as { token?: unknown; expireTimeMillis?: unknown };
  if (typeof body.token !== "string" || typeof body.expireTimeMillis !== "number") {
    throw new Error("app check mint returned an unexpected body");
  }
  return { token: body.token, expireTimeMillis: body.expireTimeMillis };
}

/**
 * The provider handed to initializeAppCheck. When getToken rejects, the App
 * Check SDK substitutes a dummy token, Auth refuses it with
 * auth/firebase-app-check-token-is-invalid., and the forms show the sentence
 * for that — so failures here are loud but never hang.
 */
export function turnstileProvider(siteKey: string, projectId: string): CustomProvider {
  return new CustomProvider({
    getToken: async () => {
      try {
        return await mint(await challenge(siteKey), projectId);
      } catch (err) {
        console.warn("App Check attestation failed:", err);
        throw err;
      }
    },
  });
}
