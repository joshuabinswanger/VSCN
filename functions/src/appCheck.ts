// Swaps a Cloudflare Turnstile token for a Firebase App Check token.
//
// This is the server half of App Check's custom-provider mode
// (documentation/20260907-turnstile-app-check-provider.md). The page proves it
// is a real browser on our site by solving a Turnstile challenge; we confirm
// that with Cloudflare and then mint an App Check token with the Admin SDK,
// which Auth and Firestore accept exactly as they accepted reCAPTCHA's. Google
// reCAPTCHA leaves the login path, which is the whole reason this exists:
// institutional networks (ETH, UZH, ...) block it, and prod enforces App
// Check, so a blocked attestation meant no sign-in at all.
//
// A plain HTTPS function, not onCall: the browser must reach it with a bare
// fetch, because the Functions SDK would ask App Check for a token first, and
// App Check is at that moment waiting on this very endpoint. It is reached
// same-origin through a Hosting rewrite (`/api/app-check` in firebase.json)
// on deployed sites, and directly on cloudfunctions.net from `astro dev`.
//
// Abuse: a Turnstile token is single-use and expires after 300 s, and the only
// way to obtain one is to pass Cloudflare's challenge on an allowed hostname.
// That IS the rate limit on minting. maxInstances caps the bill regardless.
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { getAppCheck } from "firebase-admin/app-check";
import { app } from "./admin";

// Set with: npx -y firebase-tools@latest functions:secrets:set TURNSTILE_SECRET_KEY
// The widget's secret from the Cloudflare dashboard. Dev holds Cloudflare's
// published always-pass test secret, so the pipeline runs end to end there
// without a real widget.
export const turnstileSecretKey = defineSecret("TURNSTILE_SECRET_KEY");

// Non-secret, per project, in functions/.env.<projectId>.
// The web app whose App Check tokens we mint — the same appId the page was
// initialised with. Minting for any other app would be pointless but is not
// allowed to be caller-chosen.
const webAppId = defineString("APP_CHECK_WEB_APP_ID");
// Hostnames the Turnstile challenge may have been served on, comma-separated.
// Subdomains of an entry count, matching Cloudflare's own hostname rule. The
// same list decides which Origins get CORS headers.
const allowedHosts = defineString("TURNSTILE_ALLOWED_HOSTS", { default: "vscn.ch" });

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** The `action` the page renders its widget with; a token for another action is not ours. */
const ACTION = "app-check";
/** One hour: App Check's default, and what reCAPTCHA Enterprise gave. */
const TTL_MS = 60 * 60 * 1000;
/** Cloudflare's documented maximum token length. */
const MAX_TOKEN_LENGTH = 2048;

interface SiteverifyOutcome {
  success?: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
}

function hostList(): string[] {
  return allowedHosts.value().split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
}

export function hostAllowed(hostname: string, list: string[]): boolean {
  const h = hostname.toLowerCase();
  return list.some((allowed) => h === allowed || h.endsWith(`.${allowed}`));
}

/** The Origin to echo in CORS headers, or null to refuse the browser. */
export function corsOriginFor(origin: string | undefined, list: string[]): string | null {
  if (!origin) return null;
  try {
    const { hostname } = new URL(origin);
    if (hostname === "localhost" || hostname === "127.0.0.1") return origin;
    return hostAllowed(hostname, list) ? origin : null;
  } catch {
    return null;
  }
}

export const mintAppCheckToken = onRequest(
  { region: "us-central1", maxInstances: 3, secrets: [turnstileSecretKey] },
  async (req, res) => {
    const list = hostList();
    const origin = corsOriginFor(req.get("origin"), list);
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type");
      res.set("Access-Control-Max-Age", "3600");
    }
    res.set("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).send("method");
      return;
    }

    const token = (req.body as { token?: unknown } | undefined)?.token;
    if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
      res.status(400).send("token");
      return;
    }

    // Behind Hosting and Cloud Run the caller's address is the first hop of
    // x-forwarded-for; remoteip is optional to Cloudflare and only sharpens
    // its verdict, so a missing value is fine.
    const remoteip = (req.get("x-forwarded-for") ?? "").split(",")[0].trim() || undefined;

    let outcome: SiteverifyOutcome;
    try {
      const verify = await fetch(SITEVERIFY, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret: turnstileSecretKey.value(), response: token, remoteip }),
      });
      outcome = (await verify.json()) as SiteverifyOutcome;
    } catch (err) {
      logger.error("siteverify unreachable", { err: String(err) });
      res.status(502).send("siteverify");
      return;
    }

    if (!outcome.success) {
      logger.warn("turnstile refused a token", { codes: outcome["error-codes"] });
      res.status(403).send("turnstile");
      return;
    }
    // Cloudflare's test secret answers without an `action`; a real widget
    // echoes the one the page rendered with. Present and different means the
    // token was minted for something other than App Check.
    if (outcome.action && outcome.action !== ACTION) {
      logger.warn("turnstile token for another action", { action: outcome.action });
      res.status(403).send("action");
      return;
    }
    if (!outcome.hostname || !hostAllowed(outcome.hostname, list)) {
      logger.warn("turnstile token from an unlisted hostname", { hostname: outcome.hostname });
      res.status(403).send("hostname");
      return;
    }

    try {
      const minted = await getAppCheck(app).createToken(webAppId.value(), { ttlMillis: TTL_MS });
      res.json({ token: minted.token, expireTimeMillis: Date.now() + minted.ttlMillis });
    } catch (err) {
      // Almost always IAM. Minting signs the token through the IAM signBlob
      // API, so the runtime service account needs roles/iam.serviceAccountTokenCreator
      // ON ITSELF — roles/editor does not include iam.serviceAccounts.signBlob,
      // which is how the first dev deploy failed (2026-09-07). Grant with:
      //   gcloud iam service-accounts add-iam-policy-binding <SA> --member=serviceAccount:<SA> --role=roles/iam.serviceAccountTokenCreator --project <project>
      logger.error("app check mint failed", { err: String(err) });
      res.status(500).send("mint");
    }
  }
);
