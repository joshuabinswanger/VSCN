// Deterministic placeholder art for the community-page prototype.
// Run: node scripts/gen-proto-images.mjs
// Writes public/proto/img/*.svg and src/lib/proto-images.json.
// Deterministic by design: re-running must not churn git.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const IMG_DIR = join(process.cwd(), "public", "proto", "img");
const MANIFEST = join(process.cwd(), "src", "lib", "proto-images.json");

const RATIOS = [
  [1000, 1000],
  [1000, 1250],
  [1250, 1000],
  [1000, 1500],
  [1500, 1000],
  [1000, 1778],
];
const INKS = ["#15171a", "#1d2b2d", "#26331f", "#3a2b1f", "#1c2436", "#2f1f2b"];
const PAPERS = ["#f4f1ec", "#eef0ea", "#f2efe9", "#eceff1", "#f3efe8", "#e9ecea"];
const MOTIFS = ["contour", "cells", "lattice", "hatch", "spectrum", "strata"];
const PER_MOTIF = 16;

/** mulberry32 — small seeded PRNG, so output is stable run to run. */
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r2 = (n) => Math.round(n * 100) / 100;

function contour(w, h, ink, rand) {
  const cx = w * (0.35 + rand() * 0.3);
  const cy = h * (0.35 + rand() * 0.3);
  const rings = 7 + Math.floor(rand() * 5);
  let out = "";
  for (let i = 0; i < rings; i++) {
    const f = (i + 1) / rings;
    const pts = [];
    for (let a = 0; a < 24; a++) {
      const th = (a / 24) * Math.PI * 2;
      const wob = 1 + (rand() - 0.5) * 0.18;
      pts.push(
        `${r2(cx + Math.cos(th) * w * 0.42 * f * wob)},${r2(cy + Math.sin(th) * h * 0.34 * f * wob)}`,
      );
    }
    out += `<polygon points="${pts.join(" ")}" fill="none" stroke="${ink}" stroke-width="${r2(1.1 + f * 1.6)}" opacity="${r2(0.3 + f * 0.5)}"/>`;
  }
  return out;
}

function cells(w, h, ink, rand) {
  let out = "";
  const n = 16 + Math.floor(rand() * 14);
  for (let i = 0; i < n; i++) {
    const cx = rand() * w;
    const cy = rand() * h;
    const rr = Math.min(w, h) * (0.04 + rand() * 0.12);
    out += `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(rr)}" fill="none" stroke="${ink}" stroke-width="1.6" opacity="0.75"/>`;
    out += `<circle cx="${r2(cx + rr * 0.2)}" cy="${r2(cy - rr * 0.15)}" r="${r2(rr * 0.28)}" fill="${ink}" opacity="0.5"/>`;
  }
  return out;
}

function lattice(w, h, ink, rand) {
  const cols = 4 + Math.floor(rand() * 3);
  const rows = Math.max(3, Math.round((cols * h) / w));
  const nodes = [];
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x <= cols; x++) {
      nodes.push([
        (x / cols) * w * 0.8 + w * 0.1 + (rand() - 0.5) * (w / cols) * 0.35,
        (y / rows) * h * 0.8 + h * 0.1 + (rand() - 0.5) * (h / rows) * 0.35,
      ]);
    }
  }
  let out = "";
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i][0] - nodes[j][0], nodes[i][1] - nodes[j][1]);
      if (d < Math.max(w, h) / cols) {
        out += `<line x1="${r2(nodes[i][0])}" y1="${r2(nodes[i][1])}" x2="${r2(nodes[j][0])}" y2="${r2(nodes[j][1])}" stroke="${ink}" stroke-width="1.1" opacity="0.45"/>`;
      }
    }
  }
  for (const [x, y] of nodes) {
    out += `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(Math.min(w, h) * 0.014)}" fill="${ink}" opacity="0.85"/>`;
  }
  return out;
}

function hatch(w, h, ink, rand) {
  const step = Math.min(w, h) / (18 + Math.floor(rand() * 14));
  const ang = -0.5 + rand();
  let out = `<g opacity="0.55">`;
  for (let i = -h; i < w + h; i += step) {
    out += `<line x1="${r2(i)}" y1="0" x2="${r2(i + h * ang)}" y2="${h}" stroke="${ink}" stroke-width="${r2(0.7 + rand() * 1.1)}"/>`;
  }
  out += `</g>`;
  const bx = w * (0.18 + rand() * 0.3);
  const by = h * (0.2 + rand() * 0.3);
  out += `<ellipse cx="${r2(bx)}" cy="${r2(by)}" rx="${r2(w * 0.26)}" ry="${r2(h * 0.2)}" fill="${ink}" opacity="0.82"/>`;
  return out;
}

function spectrum(w, h, ink, rand) {
  const n = 22 + Math.floor(rand() * 20);
  let out = "";
  for (let i = 0; i < n; i++) {
    const bw = w / n;
    const bh = h * (0.08 + Math.pow(rand(), 2) * 0.86);
    out += `<rect x="${r2(i * bw + bw * 0.18)}" y="${r2(h - bh)}" width="${r2(bw * 0.64)}" height="${r2(bh)}" fill="${ink}" opacity="${r2(0.35 + rand() * 0.5)}"/>`;
  }
  out += `<line x1="0" y1="${r2(h - 1)}" x2="${w}" y2="${r2(h - 1)}" stroke="${ink}" stroke-width="2"/>`;
  return out;
}

function strata(w, h, ink, rand) {
  const bands = 5 + Math.floor(rand() * 5);
  let out = "";
  let y = 0;
  for (let i = 0; i < bands; i++) {
    const bh = (h / bands) * (0.55 + rand() * 0.9);
    const pts = [`0,${r2(y)}`];
    for (let x = 0; x <= 10; x++) {
      pts.push(`${r2((x / 10) * w)},${r2(y + (rand() - 0.5) * h * 0.05)}`);
    }
    pts.push(`${w},${r2(y + bh)}`, `0,${r2(y + bh)}`);
    out += `<polygon points="${pts.join(" ")}" fill="${ink}" opacity="${r2(0.14 + (i / bands) * 0.55)}"/>`;
    y += bh;
  }
  return out;
}

const DRAW = { contour, cells, lattice, hatch, spectrum, strata };

rmSync(IMG_DIR, { recursive: true, force: true });
mkdirSync(IMG_DIR, { recursive: true });

const manifest = [];
let seed = 1;
for (const motif of MOTIFS) {
  for (let i = 0; i < PER_MOTIF; i++) {
    const rand = rng(seed++ * 2654435761);
    const [w, h] = RATIOS[(i + MOTIFS.indexOf(motif)) % RATIOS.length];
    const ink = INKS[Math.floor(rand() * INKS.length)];
    const paper = PAPERS[Math.floor(rand() * PAPERS.length)];
    const name = `${motif}-${String(i).padStart(2, "0")}.svg`;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
      `<rect width="${w}" height="${h}" fill="${paper}"/>` +
      DRAW[motif](w, h, ink, rand) +
      `</svg>`;
    writeFileSync(join(IMG_DIR, name), svg, "utf8");
    manifest.push({ src: `/proto/img/${name}`, width: w, height: h, motif });
  }
}

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(
  `Wrote ${manifest.length} SVGs to public/proto/img and the manifest to src/lib/proto-images.json`,
);
