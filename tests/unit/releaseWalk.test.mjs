// The release walk's PURE half (scripts/lib/release-walk.mjs). The browser
// steps are exercised only by running scripts/walk-release.mjs against a real
// site; what is worth pinning here is that the runner refuses to start
// half-configured, and that the sentence it prints says which step failed.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ORIGINS,
  STEPS,
  buildCommit,
  captionFor,
  memberLinks,
  mergeDotenv,
  parseWalkArgs,
  walkCredentials,
  walkReport,
} from "../../scripts/lib/release-walk.mjs";

test("--project is required and must be an alias, never a raw project id", () => {
  assert.throws(() => parseWalkArgs([]), /--project prod\|dev is required/);
  assert.throws(() => parseWalkArgs(["--project", "vscn-39508"]), /must be one of prod, dev/);
  assert.equal(parseWalkArgs(["--project", "prod"]).origin, ORIGINS.prod);
  assert.equal(parseWalkArgs(["--project", "dev"]).origin, ORIGINS.dev);
});

test("--origin overrides the live origin and loses its trailing slash; unknown flags are refused", () => {
  const args = parseWalkArgs(["--project", "prod", "--origin", "https://vscn-39508--pr.web.app/", "--release", "f21a60f", "--headed"]);
  assert.equal(args.origin, "https://vscn-39508--pr.web.app");
  assert.equal(args.release, "f21a60f");
  assert.equal(args.headed, true);
  assert.equal(args.artifactsDir, "walk-artifacts");
  assert.throws(() => parseWalkArgs(["--project", "prod", "--verbose"]), /Unknown argument --verbose/);
  assert.throws(() => parseWalkArgs(["--project"]), /--project needs a value/);
});

test("prod needs the App Check debug token, dev does not, and every missing name is listed at once", () => {
  assert.throws(() => walkCredentials({}, "prod"), /Missing WALK_MEMBER_EMAIL, WALK_MEMBER_PASSWORD, WALK_APPCHECK_DEBUG_TOKEN/);
  assert.throws(() => walkCredentials({ WALK_MEMBER_EMAIL: "a", WALK_MEMBER_PASSWORD: "b" }, "prod"), /Missing WALK_APPCHECK_DEBUG_TOKEN/);
  const dev = walkCredentials({ WALK_MEMBER_EMAIL: "a", WALK_MEMBER_PASSWORD: "b" }, "dev");
  assert.deepEqual(dev, { email: "a", password: "b", debugToken: null });
  const prod = walkCredentials({ WALK_MEMBER_EMAIL: "a", WALK_MEMBER_PASSWORD: "b", WALK_APPCHECK_DEBUG_TOKEN: "t" }, "prod");
  assert.equal(prod.debugToken, "t");
  // gh secret set and .env.walk both tend to hand over a trailing newline
  const piped = walkCredentials({ WALK_MEMBER_EMAIL: "walk@example.org\r\n", WALK_MEMBER_PASSWORD: " p \n", WALK_APPCHECK_DEBUG_TOKEN: "t\n" }, "prod");
  assert.deepEqual(piped, { email: "walk@example.org", password: "p", debugToken: "t" });
  assert.throws(() => walkCredentials({ WALK_MEMBER_EMAIL: "a", WALK_MEMBER_PASSWORD: "   " }, "dev"), /Missing WALK_MEMBER_PASSWORD/);
});

test(".env.walk fills gaps and never overrides the environment", () => {
  const env = mergeDotenv({ WALK_MEMBER_EMAIL: "from-env" }, [
    "# the walk member",
    "WALK_MEMBER_EMAIL=from-file",
    'WALK_MEMBER_PASSWORD="p=ss word"',
    "WALK_APPCHECK_DEBUG_TOKEN='tok'",
    "",
    "not a pair",
  ].join("\n"));
  assert.equal(env.WALK_MEMBER_EMAIL, "from-env");
  assert.equal(env.WALK_MEMBER_PASSWORD, "p=ss word");
  assert.equal(env.WALK_APPCHECK_DEBUG_TOKEN, "tok");
});

test("the caption names the run and fits the field", () => {
  const when = new Date("2026-09-23T06:00:00.123Z");
  assert.equal(captionFor("f21a60f1234567", when), "Release walk f21a60f 2026-09-23T06:00:00Z");
  assert.equal(captionFor(null, when), "Release walk manual 2026-09-23T06:00:00Z");
  assert.ok(captionFor("x".repeat(200), when).length <= 140);
});

test("member links come out unique, in order, with or without locale prefix and trailing slash", () => {
  const html = `
    <a href="/members/alice-laigle/">A</a> <a href="/members/alice-laigle">A again</a>
    <a href="https://vscn.ch/members/michael-zehnder/">M</a> <a href="/de/members/ikonaut">I</a>
    <a href="/members/">index</a> <a href="/community/">c</a>`;
  assert.deepEqual(memberLinks(html), ["/members/alice-laigle", "/members/michael-zehnder", "/de/members/ikonaut"]);
  assert.equal(buildCommit('<head><meta name="build-commit" content="f21a60f"></head>'), "f21a60f");
  assert.equal(buildCommit("<head></head>"), null);
});

test("a green report is one GREEN line; a red one names the step, its number and the reason", () => {
  const green = walkReport({
    results: STEPS.map((s) => ({ id: s.id, ok: true, ms: 1200 })),
    origin: "https://vscn.ch",
    release: "f21a60f9",
    leftovers: 1,
    buildCommit: "f21a60f",
  });
  assert.equal(green.verdict, "GREEN");
  assert.equal(green.exitCode, 0);
  assert.match(green.logLine, /^Walk:\s+GREEN — all six steps on vscn\.ch for f21a60f as the verification member \(1 leftover image from an earlier run removed first; site built from f21a60f\)$/);
  assert.equal(green.table.split("\n").length, 6);
  assert.ok(green.table.split("\n").every((line) => line.startsWith("PASS")));

  const red = walkReport({
    results: [
      { id: "sign-in", ok: true, ms: 8000 },
      { id: "upload", ok: false, ms: 90000, error: "queue row reported: Upload failed. Try again." },
    ],
    origin: "https://vscn.ch",
    release: null,
  });
  assert.equal(red.verdict, "RED");
  assert.equal(red.exitCode, 1);
  assert.equal(red.logLine, "Walk:    RED — step 2 (upload) failed on vscn.ch: queue row reported: Upload failed. Try again.");
  const rows = red.table.split("\n");
  assert.match(rows[0], /^PASS/);
  assert.match(rows[1], /^FAIL.*upload/);
  assert.match(rows[2], /queue row reported/);
  assert.match(rows[3], /^ {3}—.*save/);
});

test("a build stamp that is not the release is a note, not a failure", () => {
  const report = walkReport({
    results: STEPS.map((s) => ({ id: s.id, ok: true, ms: 100 })),
    origin: "https://vscn.ch",
    release: "abcdef0123",
    buildCommit: "f21a60f",
  });
  assert.equal(report.verdict, "GREEN");
  assert.match(report.logLine, /NOTE: the site's build stamp f21a60f is not the release abcdef0/);
});
