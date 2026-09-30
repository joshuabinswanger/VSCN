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
// Abuse. A Turnstile token is single-use and expires after 300 s, and the only
// way to obtain one is to pass Cloudflare's challenge on an allowed hostname:
// that bounds SUCCESSFUL mints, and nothing else does. It bounds nothing about
// the requests themselves — every well-formed POST costs one siteverify round
// trip whatever its token says — so this endpoint's availability is what a
// flood attacks (2026-09-29 review, T2-12): a request held a Cloud Run slot
// until Cloudflare answered, up to the platform's 60 s default, and with prod
// enforcing App Check on Auth, Firestore and every callable, saturating it
// would have taken sign-in and every member write down with it. Hence:
//
//   - Nothing reaches Cloudflare before the request has passed cheap checks
//     (method, content type, size, token shape). Garbage costs a few
//     microseconds and no upstream call.
//   - The siteverify call carries its own clock (SITEVERIFY_TIMEOUT_MS) and
//     the function a slightly longer one, so a stalled Cloudflare frees the
//     slot in seconds and the member gets our sentence, not the platform's.
//   - There is deliberately NO per-IP throttle here. Behind the Hosting
//     rewrite the one address the request path writes into x-forwarded-for
//     is Hosting's own egress, shared by every member; the visitor's address
//     rides in a header (fastly-client-ip) that anyone calling the function
//     directly can set themselves; and members at ETH or UZH arrive from one
//     NAT address by the hundred. Every key available is either spoofable
//     (no protection) or shared (a self-inflicted outage). Rate limiting by
//     visitor belongs at Cloudflare's edge in front of vscn.ch, where the
//     visitor is actually known. maxInstances caps the bill regardless.
//   - No Firestore counter either: a write per request would let a flood
//     run up the bill as well as the latency.
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
export const MAX_TOKEN_LENGTH = 2048;
/**
 * A token is one run of visible ASCII (Turnstile's are base64url-ish, dotted).
 * Whitespace, control bytes or non-ASCII cannot be a token and are refused
 * here rather than sent to Cloudflare to be refused there.
 */
const TOKEN_SHAPE = /^[\x21-\x7e]+$/;
/**
 * The request is `{ "token": "<2048 chars at most>" }`: 8 KiB is several
 * times that. The Functions Framework itself parses bodies up to 1 GiB, so
 * this is the only cap. It runs after the framework has parsed the body — it
 * cannot save that work — but it keeps an oversized request off Cloudflare.
 */
export const MAX_BODY_BYTES = 8 * 1024;
/**
 * How long Cloudflare gets to answer. Normally it answers in well under a
 * second; the bound exists for the day it does not, so that a stalled
 * upstream frees this instance's slot instead of holding it for a minute.
 * The client spends this out of ONE 24 s attestation budget shared with a
 * mobile challenge that can itself take 15-25 s (src/lib/appCheckTiming.ts),
 * so it has to stay small: a mint that takes 8 s is already a lost login on
 * a slow phone, and waiting longer would rescue nothing.
 */
export const SITEVERIFY_TIMEOUT_MS = 8_000;
/**
 * The function's own clock, above SITEVERIFY_TIMEOUT_MS plus the mint call so
 * that our own 504 (with a reason the client can quote) wins over the
 * platform's, and well under Auth's 30 s request timeout on the client.
 */
export const TIMEOUT_SECONDS = 15;

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

/**
 * The Turnstile token in the request, or the status and one-word reason to
 * refuse it with. Everything here is decided from the request alone, before
 * any upstream call, and each refusal is a few comparisons at most.
 */
export function tokenFromRequest(req: {
  get(name: string): string | undefined;
  body?: unknown;
}): { token: string } | { status: number; reason: string } {
  if (!/^application\/json\b/i.test(req.get("content-type") ?? "")) {
    return { status: 415, reason: "content-type" };
  }
  const declared = Number(req.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return { status: 413, reason: "size" };
  const body = req.body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { status: 400, reason: "body" };
  }
  const token = (body as { token?: unknown }).token;
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH || !TOKEN_SHAPE.test(token)) {
    return { status: 400, reason: "token" };
  }
  return { token };
}

/**
 * The first x-forwarded-for hop, as a HINT for Cloudflare's `remoteip`,
 * which is optional and only sharpens its verdict: a wrong or missing value
 * fails nothing (siteverify has no mismatch error code), so best-effort is
 * enough. It is NOT the visitor's address in any trustworthy sense — the
 * caller can write that hop themselves, and behind the Hosting rewrite it
 * may be a proxy — which is why nothing here keys anything on it; see the
 * header. Kept as it has always been because it is proven on prod.
 */
export function visitorHint(req: { get(name: string): string | undefined }): string | undefined {
  return (req.get("x-forwarded-for") ?? "").split(",")[0].trim() || undefined;
}

export const mintAppCheckToken = onRequest(
  {
    region: "us-central1",
    maxInstances: 3,
    // 80 concurrent requests per instance is the platform default for a
    // 1-vCPU function; written out because it is a sizing decision: each
    // request spends its life waiting on Cloudflare, so the slots are cheap
    // and a low number would turn a modest burst of real logins into 429s.
    concurrency: 80,
    timeoutSeconds: TIMEOUT_SECONDS,
    // Public on purpose and in writing: the Hosting rewrite and the page's
    // bare fetch both call it anonymously, and a functions deploy rewrites
    // the service's invoker policy from this manifest (see publication.ts
    // for the outage an undeclared invoker caused).
    invoker: "public",
    secrets: [turnstileSecretKey],
  },
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

    const parsed = tokenFromRequest(req);
    if (!("token" in parsed)) {
      res.status(parsed.status).send(parsed.reason);
      return;
    }
    const { token } = parsed;

    let outcome: SiteverifyOutcome;
    try {
      const verify = await fetch(SITEVERIFY, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret: turnstileSecretKey.value(), response: token, remoteip: visitorHint(req) }),
        signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
      });
      if (!verify.ok) {
        logger.error("siteverify answered with an error status", { status: verify.status });
        res.status(502).send("siteverify");
        return;
      }
      outcome = (await verify.json()) as SiteverifyOutcome;
    } catch (err) {
      // undici rejects an AbortSignal.timeout() with a DOMException named
      // TimeoutError; anything else is DNS, TLS, a reset, or a body that was
      // not JSON. The client only reads the status and the word, so the
      // distinction is for the logs and for whoever reads a member's report.
      if (err instanceof Error && err.name === "TimeoutError") {
        logger.error("siteverify did not answer in time", { timeoutMs: SITEVERIFY_TIMEOUT_MS });
        res.status(504).send("timeout");
        return;
      }
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
