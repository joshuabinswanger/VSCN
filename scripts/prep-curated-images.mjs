// Downscale + WebP-encode the curated member images into
// scripts/assets/curated-galleries/img,
// and emit a manifest with the REAL post-resize dimensions (the card's frame
// aspect-ratio comes straight from these, so they must match the file on disk).
import sharp from "sharp";
import { readdirSync, statSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SRC = "D:/SynoDrive/VSCN/Design/member-curation";
const OUT = "D:/SynoDrive/VSCN/repo/scripts/assets/curated-galleries/img";
const MAX_EDGE = 1200; // card caps at 26rem (~416px); 1200 covers 2x DPR with room
const QUALITY = 82;    // same as the agreed gallery pipeline

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const manifest = {};
for (const slug of readdirSync(SRC)) {
  if (!statSync(join(SRC, slug)).isDirectory()) continue;
  const files = readdirSync(join(SRC, slug))
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .sort();
  if (!files.length) continue;
  mkdirSync(join(OUT, slug), { recursive: true });
  manifest[slug] = [];
  for (const f of files) {
    const base = f.replace(/\.[^.]+$/, "") + ".webp";
    const info = await sharp(join(SRC, slug, f))
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(join(OUT, slug, base));
    manifest[slug].push({ src: `/proto/img/real/${slug}/${base}`, width: info.width, height: info.height });
    console.log(`${slug}/${base}  ${info.width}x${info.height}  ${Math.round(info.size / 1024)}KB`);
  }
}
writeFileSync("D:/SynoDrive/VSCN/repo/scripts/assets/curated-galleries/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(`\nmembers with images: ${Object.keys(manifest).length}`);
