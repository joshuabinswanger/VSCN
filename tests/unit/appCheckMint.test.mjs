// The App Check mint endpoint (functions/src/appCheck.ts) against a mocked
// Cloudflare. The real module runs with its Firebase imports replaced, so
// what is exercised is the handler as deployed: which requests reach
// siteverify at all, what a stalled or broken siteverify turns into, and
// the clocks the manifest declares against the client's budget.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "../helpers/load-ts.mjs";
import { ATTESTATION_BUDGET_MS, AUTH_REQUEST_TIMEOUT_MS } from "../../src/lib/appCheckTiming.ts";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const GOOD = { success: true, hostname: "vscn.ch", action: "app-check" };

/** The module with every I/O seam replaced; `calls` records what reached fetch. */
function load({ fetch: fetchImpl, timeout } = {}) {
  const calls = [];
  const logs = [];
  const defaultFetch = async () => ({ ok: true, status: 200, json: async () => GOOD });
  const mod = loadTs(
    "functions/src/appCheck.ts",
    {
      "firebase-functions/v2/https": { onRequest: (options, handler) => Object.assign(handler, { options }) },
      "firebase-functions/params": {
        defineSecret: () => ({ value: () => "the-secret" }),
        defineString: (name) => ({ value: () => (name === "TURNSTILE_ALLOWED_HOSTS" ? "vscn.ch, localhost" : "1:web:app") }),
      },
      "firebase-functions/v2": { logger: { warn: (m, d) => logs.push(["warn", m, d]), error: (m, d) => logs.push(["error", m, d]) } },
      "firebase-admin/app-check": { getAppCheck: () => ({ createToken: async () => ({ token: "minted", ttlMillis: 3_600_000 }) }) },
      "./admin": { app: {} },
    },
    {
      fetch: (url, init) => {
        calls.push({ url, init });
        return fetchImpl ? fetchImpl(url, init) : defaultFetch(url, init);
      },
      // The real AbortSignal, with the timeout recorded (and shortened when a
      // test wants to see it fire without waiting eight seconds).
      AbortSignal: {
        timeout(ms) {
          calls.timeoutMs = ms;
          return AbortSignal.timeout(timeout ?? ms);
        },
      },
    }
  );
  return { ...mod, calls, logs };
}

function request({ method = "POST", headers = {}, body } = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  if (body !== undefined && !("content-type" in lower)) lower["content-type"] = "application/json";
  return { method, body, get: (name) => lower[name.toLowerCase()] };
}

function response() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.set = (k, v) => { res.headers[k] = v; return res; };
  res.status = (n) => { res.statusCode = n; return res; };
  res.send = (b) => { res.body = b; return res; };
  res.json = (o) => { res.body = o; return res; };
  return res;
}

async function call(mod, req) {
  const res = response();
  await mod.mintAppCheckToken(req, res);
  return res;
}

test("a well-formed token is verified with Cloudflare under a clock and minted", async () => {
  const mod = load();
  const res = await call(mod, request({ body: { token: "turnstile-response" }, headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.token, "minted");
  assert.equal(typeof res.body.expireTimeMillis, "number");
  assert.equal(mod.calls.length, 1);
  const { url, init } = mod.calls[0];
  assert.equal(url, SITEVERIFY);
  assert.ok(init.signal instanceof AbortSignal, "the siteverify fetch carries an AbortSignal");
  assert.equal(mod.calls.timeoutMs, mod.SITEVERIFY_TIMEOUT_MS);
  assert.deepEqual(JSON.parse(init.body), { secret: "the-secret", response: "turnstile-response", remoteip: "203.0.113.9" });
});

test("OPTIONS and non-POST methods never reach Cloudflare", async () => {
  const mod = load();
  const pre = await call(mod, request({ method: "OPTIONS", headers: { origin: "https://vscn.ch" } }));
  assert.equal(pre.statusCode, 204);
  assert.equal(pre.headers["Access-Control-Allow-Origin"], "https://vscn.ch");
  const get = await call(mod, request({ method: "GET" }));
  assert.equal(get.statusCode, 405);
  assert.equal(mod.calls.length, 0);
});

test("requests refused before any upstream call: content type, size, body shape, token shape", async () => {
  const mod = load();
  const cases = [
    [request({ body: { token: "abc" }, headers: { "content-type": "text/plain" } }), 415, "content-type"],
    [request({ body: { token: "abc" }, headers: { "content-length": String(mod.MAX_BODY_BYTES + 1) } }), 413, "size"],
    [request({ body: "abc" }), 400, "body"],
    [request({ body: ["abc"] }), 400, "body"],
    [request({ body: {} }), 400, "token"],
    [request({ body: { token: 42 } }), 400, "token"],
    [request({ body: { token: "" } }), 400, "token"],
    [request({ body: { token: "a".repeat(mod.MAX_TOKEN_LENGTH + 1) } }), 400, "token"],
    [request({ body: { token: "abc def" } }), 400, "token"],
    [request({ body: { token: "abc\ndef" } }), 400, "token"],
    [request({ body: { token: "abc\u0000" } }), 400, "token"],
    [request({ body: { token: "tökén" } }), 400, "token"],
  ];
  for (const [req, status, reason] of cases) {
    const res = await call(mod, req);
    assert.equal(res.statusCode, status, `${JSON.stringify(req.body)} -> ${reason}`);
    assert.equal(res.body, reason);
  }
  assert.equal(mod.calls.length, 0, "none of them reached fetch");
  // The edges that are still fine.
  const max = await call(mod, request({ body: { token: "a".repeat(mod.MAX_TOKEN_LENGTH) }, headers: { "content-length": String(mod.MAX_BODY_BYTES) } }));
  assert.equal(max.statusCode, 200);
  const charset = await call(mod, request({ body: { token: "abc" }, headers: { "content-type": "application/json; charset=utf-8" } }));
  assert.equal(charset.statusCode, 200);
});

test("a stalled siteverify is cut off by the clock and answered 504, not held for the platform's minute", async () => {
  // fetch that only ever settles when its signal aborts, exactly like a
  // hung upstream under undici; the recorded timeout is shortened to 20 ms.
  const hang = (_url, init) =>
    new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
  const mod = load({ fetch: hang, timeout: 20 });
  const started = Date.now();
  const res = await call(mod, request({ body: { token: "abc" } }));
  assert.equal(res.statusCode, 504);
  assert.equal(res.body, "timeout");
  assert.ok(Date.now() - started < 2_000, "answered as soon as the signal fired");
  assert.ok(mod.logs.some(([, m]) => /did not answer in time/.test(m)));
});

test("an unreachable or broken siteverify is a 502 with the reason word the client quotes", async () => {
  const down = load({ fetch: async () => { throw new TypeError("fetch failed"); } });
  assert.equal((await call(down, request({ body: { token: "abc" } }))).body, "siteverify");
  assert.equal((await call(down, request({ body: { token: "abc" } }))).statusCode, 502);

  const erroring = load({ fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }) });
  const res = await call(erroring, request({ body: { token: "abc" } }));
  assert.equal(res.statusCode, 502);
  assert.equal(res.body, "siteverify");

  const garbage = load({ fetch: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("not json"); } }) });
  assert.equal((await call(garbage, request({ body: { token: "abc" } }))).statusCode, 502);
});

test("Cloudflare's verdict is honoured: refused, wrong action, unlisted hostname", async () => {
  const verdicts = [
    [{ success: false, "error-codes": ["invalid-input-response"] }, "turnstile"],
    [{ ...GOOD, action: "login" }, "action"],
    [{ ...GOOD, hostname: "evil.example" }, "hostname"],
    [{ success: true, action: "app-check" }, "hostname"],
  ];
  for (const [outcome, reason] of verdicts) {
    const mod = load({ fetch: async () => ({ ok: true, status: 200, json: async () => outcome }) });
    const res = await call(mod, request({ body: { token: "abc" } }));
    assert.equal(res.statusCode, 403, reason);
    assert.equal(res.body, reason);
  }
  // The test secret answers without an action, and a subdomain of a listed host counts.
  const lax = load({ fetch: async () => ({ ok: true, status: 200, json: async () => ({ success: true, hostname: "www.vscn.ch" }) }) });
  assert.equal((await call(lax, request({ body: { token: "abc" } }))).statusCode, 200);
});

test("the visitor hint is the first x-forwarded-for hop, and is optional", () => {
  const { visitorHint } = load();
  const req = (headers) => ({ get: (n) => headers[n] });
  assert.equal(visitorHint(req({ "x-forwarded-for": " 203.0.113.9 , 10.0.0.1" })), "203.0.113.9");
  assert.equal(visitorHint(req({})), undefined);
  assert.equal(visitorHint(req({ "x-forwarded-for": "" })), undefined);
});

test("the manifest's clocks fit inside the client's, and the invoker is declared public", () => {
  const { mintAppCheckToken, SITEVERIFY_TIMEOUT_MS, TIMEOUT_SECONDS } = load();
  const { options } = mintAppCheckToken;
  assert.equal(options.invoker, "public", "the Hosting rewrite and the page's bare fetch call it anonymously");
  assert.equal(options.timeoutSeconds, TIMEOUT_SECONDS);
  assert.ok(options.concurrency >= 1 && options.maxInstances >= 1);
  // The upstream clock must fire before the function's own, or the platform
  // 504 wins and the reason word is lost.
  assert.ok(SITEVERIFY_TIMEOUT_MS < TIMEOUT_SECONDS * 1000);
  // A mobile Turnstile challenge can take 15-25 s of the client's 24 s
  // budget; the mint must not be what pushes it past Auth's clock.
  assert.ok(SITEVERIFY_TIMEOUT_MS <= ATTESTATION_BUDGET_MS / 3);
  assert.ok(TIMEOUT_SECONDS * 1000 < AUTH_REQUEST_TIMEOUT_MS);
});
