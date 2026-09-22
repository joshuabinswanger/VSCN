// The release walk's PURE half: argument and credential parsing, the step
// list, and the sentences the runner prints. Everything that touches a browser
// lives in scripts/walk-release.mjs and is exercised only by running it.
// Design: documentation/20260923-release-walk-automation.md.

/** Where each project's live site answers. Never a PR preview. */
export const ORIGINS = Object.freeze({
  prod: "https://vscn.ch",
  dev: "https://vscn-dev-f4b60.web.app",
});

/** The protocol's six steps (release-verification.md, "The human walk"), in order. */
export const STEPS = Object.freeze([
  { id: "sign-in", title: "sign in as the verification member" },
  { id: "upload", title: "upload one gallery image" },
  { id: "save", title: "caption it and save the profile" },
  { id: "preview", title: "the image renders on the Preview tab" },
  { id: "delete", title: "delete the image" },
  { id: "anonymous", title: "sign out; home and one member page render anonymously" },
]);

/**
 * `--project prod|dev` is required and must be an alias from ORIGINS: a raw
 * project id is refused so nobody points the walk at a project it has no
 * member on. `--origin` overrides the live origin (a staging channel, never a
 * PR preview), `--release` is stamped into the caption and the log line,
 * `--headed` opens a visible browser for a human to watch, `--artifacts`
 * moves the failure output.
 */
export function parseWalkArgs(argv) {
  const out = { project: null, origin: null, release: null, headed: false, artifactsDir: "walk-artifacts" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) throw new Error(`${arg} needs a value`);
      i++;
      return v;
    };
    if (arg === "--project") out.project = value();
    else if (arg === "--origin") out.origin = value();
    else if (arg === "--release") out.release = value();
    else if (arg === "--artifacts") out.artifactsDir = value();
    else if (arg === "--headed") out.headed = true;
    else throw new Error(`Unknown argument ${arg}`);
  }
  if (!out.project) throw new Error("--project prod|dev is required");
  if (!(out.project in ORIGINS)) throw new Error(`--project must be one of ${Object.keys(ORIGINS).join(", ")}, not ${out.project}`);
  out.origin = (out.origin ?? ORIGINS[out.project]).replace(/\/+$/, "");
  return out;
}

/**
 * The member's email and password are always required. The App Check debug
 * token is required on prod, where Turnstile is real, and ignored elsewhere:
 * dev carries Cloudflare's always-pass test key, so a headless browser gets
 * through the provider itself and the debug token would only hide that path.
 */
export function walkCredentials(env, project) {
  // Trimmed: a value piped into `gh secret set` or typed into .env.walk
  // arrives with a trailing newline more often than not, and an email with a
  // newline in it is a login that fails for no visible reason.
  const read = (name) => (typeof env[name] === "string" ? env[name].trim() : "");
  const missing = ["WALK_MEMBER_EMAIL", "WALK_MEMBER_PASSWORD"].filter((name) => !read(name));
  if (project === "prod" && !read("WALK_APPCHECK_DEBUG_TOKEN")) missing.push("WALK_APPCHECK_DEBUG_TOKEN");
  if (missing.length) throw new Error(`Missing ${missing.join(", ")} (environment or .env.walk)`);
  return {
    email: read("WALK_MEMBER_EMAIL"),
    password: read("WALK_MEMBER_PASSWORD"),
    debugToken: project === "prod" ? read("WALK_APPCHECK_DEBUG_TOKEN") : null,
  };
}

/** Parse a dotenv-style file: KEY=value lines, optional quotes, # comments. Never overrides what is already set. */
export function mergeDotenv(env, text) {
  const out = { ...env };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (key && !(key in out)) out[key] = value;
  }
  return out;
}

/** The caption written in step 3: says which run made the image, within the field's 140 characters. */
export function captionFor(release, when) {
  const stamp = when.toISOString().replace(/\.\d{3}Z$/, "Z");
  return `Release walk ${release ? release.slice(0, 7) : "manual"} ${stamp}`.slice(0, 140);
}

/** Unique /members/<slug> paths in a page, in document order. Retired slugs still resolve, so any of them serves. */
export function memberLinks(html) {
  const seen = new Set();
  for (const match of html.matchAll(/href="(?:https?:\/\/[^/"]+)?(\/(?:de\/)?members\/[a-z0-9-]+)\/?"/g)) seen.add(match[1]);
  return [...seen];
}

/** The build-commit stamp every page carries in <head>, or null. */
export function buildCommit(html) {
  return html.match(/<meta name="build-commit" content="([^"]*)"/)?.[1] ?? null;
}

/**
 * The step table and the release-log line. `results` is one row per step
 * attempted: { id, ok, ms, error? }. Steps after a failure are not attempted
 * and are listed as such.
 */
export function walkReport({ results, origin, release, leftovers = 0, buildCommit: stamp = null }) {
  const failed = results.find((r) => !r.ok);
  const lines = [];
  for (const step of STEPS) {
    const r = results.find((x) => x.id === step.id);
    const mark = !r ? "   —" : r.ok ? "PASS" : "FAIL";
    const ms = r ? `${String(Math.round(r.ms / 100) / 10).padStart(6)}s` : "       ";
    lines.push(`${mark} ${ms}  ${step.id.padEnd(10)} ${step.title}${r && !r.ok ? `\n                    ${r.error}` : ""}`);
  }
  const notes = [];
  if (leftovers) notes.push(`${leftovers} leftover image${leftovers === 1 ? "" : "s"} from an earlier run removed first`);
  if (stamp) notes.push(`site built from ${stamp}`);
  if (release && stamp && !release.startsWith(stamp)) notes.push(`NOTE: the site's build stamp ${stamp} is not the release ${release.slice(0, 7)} — the machine check owns that verdict`);
  const where = `${origin.replace(/^https?:\/\//, "")}${release ? ` for ${release.slice(0, 7)}` : ""}`;
  const logLine = failed
    ? `Walk:    RED — step ${STEPS.findIndex((s) => s.id === failed.id) + 1} (${failed.id}) failed on ${where}: ${failed.error}`
    : `Walk:    GREEN — all six steps on ${where} as the verification member${notes.length ? ` (${notes.join("; ")})` : ""}`;
  return { verdict: failed ? "RED" : "GREEN", exitCode: failed ? 1 : 0, table: lines.join("\n"), notes, logLine };
}
