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
// Three lessons are built in:
//
//   1. The script tag is OURS, with an `error` listener. The SDK's reCAPTCHA
//      loader registered only `onload`, so a blocked script left App Check
//      pending forever and Auth reported its own 30 s timeout as a network
//      error. Here a blocked script flips isSecurityCheckBlocked() at once,
//      and the forms refuse before calling Auth.
//   2. The WHOLE attestation — script, challenge, mint — runs under ONE budget
//      shorter than Auth's 30 s (appCheckTiming.ts). Per-step deadlines were
//      not enough: 2026-09-08, Chrome on iOS, "server not reached". On mobile
//      a Turnstile challenge in this widget configuration intermittently takes
//      15-25 s (Cloudflare community, Sep 2025); with the script and the mint
//      round trip on top, the attestation outlived Auth's clock and the member
//      was told the login server was unreachable.
//   3. Attestation starts at page load (warmUp, called from firebase.ts), not
//      at the login click, so a slow mobile challenge overlaps the typing and
//      the token is already cached (one hour, IndexedDB) when Auth asks. A
//      token that arrives after its attempt gave up is kept as a spare.
//
// The mint call is a plain fetch and MUST stay one. httpsCallable asks App
// Check for a token before every call, and App Check would at that moment be
// waiting on this very function: a deadlock, not a recursion error.
import { CustomProvider, getToken as getAppCheckToken, type AppCheck, type AppCheckToken } from "firebase/app-check";
import { mintEndpointFor } from "./appCheckEndpoint.ts";
import { ATTESTATION_BUDGET_MS, spareIsUsable } from "./appCheckTiming.ts";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SLOT_ID = "turnstile-slot";
const ACTION = "app-check";

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
let pending: { resolve: (token: string) => void; reject: (err: Error) => void; timer: number } | null = null;
/** A Turnstile token nobody was waiting for when it arrived; see lesson 3. */
let spare: { token: string; issuedAt: number } | null = null;

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

/** One attestation's clock: everything in it must finish by `until`. */
class Budget {
  private readonly until: number;
  constructor(ms: number) {
    this.until = Date.now() + ms;
  }
  remaining(): number {
    return Math.max(0, this.until - Date.now());
  }
  /** Reject `work` if it has not settled by the budget's end. */
  bound<T>(work: Promise<T>, what: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${what}: attestation budget of ${ATTESTATION_BUDGET_MS} ms spent`)),
        this.remaining()
      );
      work.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); }
      );
    });
  }
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
  if (p) {
    clearTimeout(p.timer);
    fn(p);
  }
}

/**
 * Turnstile handed us a token. If an attempt is waiting, it gets it. If not —
 * the member clicked the checkbox after the attempt's clock ran out, or
 * Turnstile refreshed an expired token on its own — keep it for the next
 * attempt rather than throwing it away, so that attempt is instant.
 */
function onToken(token: string): void {
  if (pending) {
    settle((p) => p.resolve(token));
  } else {
    spare = { token, issuedAt: Date.now() };
  }
}

function takeSpare(): string | null {
  const s = spare;
  spare = null;
  return s && spareIsUsable(s.issuedAt, Date.now()) ? s.token : null;
}

/**
 * Run one Turnstile challenge and resolve with its token. The widget is
 * rendered once, in `execute` mode, so nothing runs until asked; each call
 * resets it and runs it again, because a Turnstile token is single-use and
 * lives five minutes, while App Check re-attests about hourly.
 */
async function challenge(siteKey: string, budget: Budget): Promise<string> {
  const turnstile = await budget.bound(loadScript(), "turnstile script did not load");
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
        callback: onToken,
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
  const late = takeSpare();
  if (late) return late;
  const id = widgetId;
  return new Promise<string>((resolve, reject) => {
    settle((p) => p.reject(new Error("turnstile challenge superseded")));
    // The clock is on `pending` itself, not around the promise: when it runs
    // out, `pending` is cleared, so a token that arrives afterwards lands in
    // `spare` (see onToken) instead of resolving a promise nobody awaits.
    const timer = window.setTimeout(
      () => settle((p) => p.reject(new Error("turnstile challenge did not finish within the attestation budget"))),
      budget.remaining()
    );
    pending = { resolve, reject, timer };
    try {
      turnstile.reset(id);
      turnstile.execute(id);
    } catch (e) {
      settle((p) => p.reject(e instanceof Error ? e : new Error(String(e))));
    }
  });
}

async function mint(turnstileToken: string, projectId: string, budget: Budget): Promise<AppCheckToken> {
  const res = await budget.bound(
    fetch(mintEndpointFor(location.hostname, projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: turnstileToken }),
    }),
    "app check mint did not answer"
  );
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
 * for that — so failures here are loud but never hang, and never outlive
 * Auth's own clock.
 */
export function turnstileProvider(siteKey: string, projectId: string): CustomProvider {
  return new CustomProvider({
    getToken: async () => {
      const budget = new Budget(ATTESTATION_BUDGET_MS);
      try {
        return await mint(await challenge(siteKey, budget), projectId, budget);
      } catch (err) {
        console.warn("App Check attestation failed:", err);
        throw err;
      }
    },
  });
}

/**
 * Start attesting now, at page load, instead of when the first Auth or
 * Firestore call asks. The App Check SDK dedupes in-flight attempts, so a
 * login click during the warm-up simply awaits the same promise — with most
 * of the budget already spent on the member's typing time, not on Auth's
 * clock. A valid cached token makes this a no-op. Failure is not an error
 * here: the call that actually needs the token will try again and report.
 */
export function warmUp(appCheck: AppCheck): void {
  void getAppCheckToken(appCheck).catch(() => {});
}
