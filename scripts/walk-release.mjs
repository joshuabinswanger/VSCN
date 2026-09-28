#!/usr/bin/env node
// The release walk: the protocol's human walk, driven by Playwright as the
// verification member. Design: documentation/20260923-release-walk-automation.md.
//
//   npm run walk:release -- --project prod
//   npm run walk:release -- --project prod --release f21a60f --headed
//
// Needs WALK_MEMBER_EMAIL, WALK_MEMBER_PASSWORD and, on prod,
// WALK_APPCHECK_DEBUG_TOKEN — from the environment or an untracked .env.walk
// next to package.json. Exit 0 when all six steps pass, 1 otherwise. On a
// failure the step's screenshot, the page console and every failed request
// land in walk-artifacts/ (or --artifacts <dir>).
//
// It acts only as the member, through the site's own front end, so it can do
// nothing a member cannot. Selectors are the editor's ids and data-* hooks;
// class names are styling and are not used here.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import sharp from "sharp";
import {
  STEPS,
  buildCommit,
  captionFor,
  memberLinks,
  mergeDotenv,
  parseWalkArgs,
  walkCredentials,
  walkReport,
} from "./lib/release-walk.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseWalkArgs(process.argv.slice(2));
const dotenvPath = join(root, ".env.walk");
const env = existsSync(dotenvPath) ? mergeDotenv(process.env, readFileSync(dotenvPath, "utf8")) : process.env;
const creds = walkCredentials(env, args.project);
const artifactsDir = resolve(root, args.artifactsDir);
mkdirSync(artifactsDir, { recursive: true });

const startedAt = new Date();
const caption = captionFor(args.release, startedAt);
const tab = (name) => `#section-tabs .section-tab[data-section="${name}"]`;
const galleryItems = () => page.locator("#gallery-editor .gallery-item");

console.log(`Release walk on ${args.origin} (${args.project})${args.release ? ` for ${args.release.slice(0, 7)}` : ""}, ${startedAt.toISOString()}`);

// ── fixture ────────────────────────────────────────────────────────────────
// 1200×800 compresses in one pass of the client's ladder and says on its face
// which run made it, in case one is ever found where it should not be.
const fixturePath = join(artifactsDir, "fixture.png");
const label = caption.replace(/&/g, "&amp;").replace(/</g, "&lt;");
await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#b7c9d6" } })
  .composite([{
    input: Buffer.from(`<svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg">
      <rect x="80" y="80" width="1040" height="640" fill="#f7f6f5" stroke="#1d1d1b" stroke-width="6"/>
      <text x="600" y="380" font-family="Arial, Helvetica, sans-serif" font-size="44" text-anchor="middle" fill="#1d1d1b">VSCN release walk</text>
      <text x="600" y="450" font-family="Arial, Helvetica, sans-serif" font-size="28" text-anchor="middle" fill="#1d1d1b">${label}</text>
      <text x="600" y="520" font-family="Arial, Helvetica, sans-serif" font-size="22" text-anchor="middle" fill="#666">uploaded and deleted by scripts/walk-release.mjs — if you can see this, the delete failed</text>
    </svg>`),
  }])
  .png()
  .toFile(fixturePath);

// ── browser ────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: !args.headed });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  locale: "en-GB",
  reducedMotion: "reduce",
  acceptDownloads: false,
});
if (creds.debugToken) {
  // Before any page script: the App Check SDK reads this at initializeAppCheck
  // and exchanges it instead of asking the Turnstile provider (design §3).
  await context.addInitScript((token) => { self.FIREBASE_APPCHECK_DEBUG_TOKEN = token; }, creds.debugToken);
}
const page = await context.newPage();
page.setDefaultTimeout(30_000);

const consoleLog = [];
const requestLog = [];
page.on("console", (msg) => consoleLog.push(`${new Date().toISOString()} [${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => consoleLog.push(`${new Date().toISOString()} [pageerror] ${err.message}`));
page.on("requestfailed", (req) => requestLog.push(`${new Date().toISOString()} FAILED ${req.method()} ${req.url()} — ${req.failure()?.errorText ?? ""}`));
page.on("response", (res) => { if (res.status() >= 400) requestLog.push(`${new Date().toISOString()} ${res.status()} ${res.request().method()} ${res.url()}`); });

// ── step harness ───────────────────────────────────────────────────────────
const results = [];
let uploaded = false; // an image of ours is (or may be) on the member
let leftovers = 0;
let stamp = null;

async function step(id, fn) {
  const started = Date.now();
  process.stdout.write(`… ${id}`);
  try {
    await fn();
    results.push({ id, ok: true, ms: Date.now() - started });
    console.log(`\r✓ ${id} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    return true;
  } catch (err) {
    const message = String(err?.message ?? err).split("\n")[0].slice(0, 300);
    results.push({ id, ok: false, ms: Date.now() - started, error: message });
    console.log(`\r✗ ${id}: ${message}`);
    await page.screenshot({ path: join(artifactsDir, `${id}-failed.png`), fullPage: true }).catch(() => {});
    writeFileSync(join(artifactsDir, `${id}-console.log`), consoleLog.join("\n") + "\n");
    writeFileSync(join(artifactsDir, `${id}-requests.log`), requestLog.join("\n") + "\n");
    writeFileSync(join(artifactsDir, `${id}-failed.html`), await page.content().catch(() => ""));
    return false;
  }
}

/** Resolve when `locator` shows, reject with the error element's text when `errorLocator` shows first. */
async function visibleBefore(locator, errorLocator, what, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await locator.isVisible().catch(() => false)) return;
    if (await errorLocator.isVisible().catch(() => false)) {
      throw new Error(`${what}: ${(await errorLocator.innerText()).trim() || "an error element appeared"}`);
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`${what}: nothing appeared within ${timeout / 1000}s`);
}

/** Click the remove control on the first gallery item and wait for the count to drop. */
async function removeFirstImage() {
  const before = await galleryItems().count();
  await galleryItems().first().locator("[data-gallery-remove]").click();
  await expect(galleryItems()).toHaveCount(before - 1, { timeout: 20_000 });
  await expect(page.locator("#gallery-status")).toBeHidden();
  // persistGalleryNow writes both profile docs right after the re-render; give
  // the commit a moment before anything else navigates away.
  await page.waitForTimeout(2_500);
}

// ── the walk ───────────────────────────────────────────────────────────────
try {
  const ok1 = await step("sign-in", async () => {
    const res = await page.goto(`${args.origin}/login`, { waitUntil: "domcontentloaded" });
    if (!res || res.status() !== 200) throw new Error(`/login answered ${res?.status()}`);
    stamp = buildCommit(await page.content());
    await page.locator("#email").fill(creds.email);
    await page.locator("#password").fill(creds.password);
    await page.locator("#submit-btn").click();
    // Auth waits for the App Check token inside its own 30 s clock; allow for it.
    const deadline = Date.now() + 45_000;
    while (!/\/profile\/?$/.test(new URL(page.url()).pathname)) {
      if (await page.locator("#auth-error").isVisible().catch(() => false)) {
        throw new Error(`login refused: ${(await page.locator("#auth-error").innerText()).trim()}`);
      }
      if (Date.now() > deadline) throw new Error(`no redirect to /profile within 45s (still at ${new URL(page.url()).pathname})`);
      await page.waitForTimeout(250);
    }
    await expect(page.locator("#profile-form")).toHaveClass(/\bis-loaded\b/, { timeout: 20_000 });
    await expect(page.locator("#nav-profile")).toBeVisible();

    // Leftovers from a failed earlier run would push the member toward the
    // cap and make a later walk fail for the wrong reason. Clear and count.
    await page.locator(tab("work")).click();
    leftovers = await galleryItems().count();
    for (let i = 0; i < leftovers; i++) await removeFirstImage();
    if (leftovers) console.log(`\n  removed ${leftovers} leftover image(s) from an earlier run`);
  });

  let imageSrc = null;
  const ok2 = ok1 && await step("upload", async () => {
    await page.locator(tab("work")).click();
    await page.locator("#gallery-files").setInputFiles(fixturePath);
    uploaded = true;
    const errorRow = page.locator("#gallery-queue .has-error [data-task-state]");
    const deadline = Date.now() + 90_000;
    while ((await galleryItems().count()) < 1) {
      if (await errorRow.count()) throw new Error(`queue row reported: ${(await errorRow.first().innerText()).trim()}`);
      if (await page.locator("#gallery-status").isVisible().catch(() => false)) {
        throw new Error(`gallery note: ${(await page.locator("#gallery-status").innerText()).trim()}`);
      }
      if (Date.now() > deadline) throw new Error("no committed gallery item within 90s");
      await page.waitForTimeout(500);
    }
    await expect(galleryItems()).toHaveCount(1);
    imageSrc = await galleryItems().first().locator("img[data-gallery-img]").getAttribute("src");
    if (!imageSrc || !/\/o\/users%2F[^%]+%2Fgallery%2F/.test(imageSrc)) throw new Error(`unexpected image src ${imageSrc}`);
  });

  const ok3 = ok2 && await step("save", async () => {
    await galleryItems().first().locator('input[data-gallery-field="caption"]').fill(caption);
    await page.locator("#save-button").click();
    await visibleBefore(page.locator("#save-msg"), page.locator("#save-error"), "save", 30_000);
  });

  const ok4 = ok3 && await step("preview", async () => {
    await page.locator(tab("preview")).click();
    const img = page.locator("[data-ppv-root] img.mprof__img");
    await expect(img).toHaveCount(1, { timeout: 15_000 });
    const src = await img.getAttribute("src");
    if (src !== imageSrc) throw new Error(`preview shows ${src}, editor holds ${imageSrc}`);
    // Not merely present: fetched and decoded, which is Storage serving the object.
    await expect.poll(() => img.evaluate((el) => el.complete && el.naturalWidth > 0), { timeout: 20_000, message: "preview image never loaded" }).toBe(true);
  });

  const ok5 = ok4 && await step("delete", async () => {
    await page.locator(tab("work")).click();
    await removeFirstImage();
    await expect(galleryItems()).toHaveCount(0);
    uploaded = false;
  });

  if (ok5) await step("anonymous", async () => {
    await page.locator(tab("account")).click();
    await page.locator("#btn-logout").click();
    await page.waitForURL((url) => url.origin === args.origin && /^\/(de\/?)?$/.test(url.pathname), { timeout: 20_000 });
    await expect(page.locator("#nav-join")).toBeVisible({ timeout: 15_000 });

    const home = await page.goto(`${args.origin}/`, { waitUntil: "domcontentloaded" });
    if (!home || home.status() !== 200) throw new Error(`home answered ${home?.status()}`);
    await expect(page.locator("body")).toHaveClass(/\bpage-loaded\b/, { timeout: 15_000 });

    const community = await page.request.get(`${args.origin}/community/`);
    if (community.status() !== 200) throw new Error(`/community/ answered ${community.status()}`);
    const [memberPath] = memberLinks(await community.text());
    if (!memberPath) throw new Error("no /members/<slug> link on /community/");
    const member = await page.goto(`${args.origin}${memberPath}/`, { waitUntil: "domcontentloaded" });
    if (!member || member.status() !== 200) throw new Error(`${memberPath}/ answered ${member?.status()}`);
    await expect(page.locator('[class*="mprof__"]').first()).toBeVisible({ timeout: 15_000 });
    console.log(`\n  member page checked: ${memberPath}/`);
  });
} finally {
  // Whatever happened above, do not leave our image on the member.
  if (uploaded) {
    try {
      if (!/\/profile/.test(page.url())) await page.goto(`${args.origin}/profile`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#profile-form")).toHaveClass(/\bis-loaded\b/, { timeout: 20_000 });
      await page.locator(tab("work")).click();
      while (await galleryItems().count()) await removeFirstImage();
      console.log("  teardown: removed the walk's image");
    } catch (err) {
      console.log(`  teardown could not remove the image: ${String(err?.message ?? err).split("\n")[0]}`);
    }
  }
  await browser.close();
}

const report = walkReport({ results, origin: args.origin, release: args.release, leftovers, buildCommit: stamp });
console.log(`\n${report.table}\n`);
console.log(`${report.verdict} — ${results.filter((r) => !r.ok).length} failing, ${results.filter((r) => r.ok).length} passing, ${STEPS.length - results.length} not attempted\n`);
console.log(report.logLine);
if (report.exitCode) console.log(`\nArtefacts: ${artifactsDir}`);
process.exit(report.exitCode);
