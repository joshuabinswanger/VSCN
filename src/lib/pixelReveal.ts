// THE PICTURE ARRIVES IN PIXELS (2026-10-23, Josh: "instead of having the fade
// in for portfolios, i want this pixelation effect for the images", pointing at
// thibaud.film's work pages).
//
// The reference is a WebGL shader; this is the same idea on a 2D canvas, which
// needs no library: the picture is drawn coarse — a handful of blocks across —
// and refines in hard steps to its full resolution, while a front wipes it in
// from the top. The front is dithered: in a band just below it, blocks of a
// coarser grid show or not at random, so the edge breaks up into pixels too.
//
// The canvas lies over the slide's picture for the length of the reveal and the
// real <img> is held invisible under it; at the end the canvas goes and the
// <img> is simply there, so nothing about the card changes once it has played.

// Blocks across the picture, coarse to fine; the last step is the picture.
const STEPS = [6, 9, 13, 18, 25, 34, 46, 62, 84, 112, 150];
// The dithered edge's grid stops refining at this point of the reveal, so the
// edge keeps a visible grain while the picture itself goes sharp.
const EDGE_CAP = 0.7;
// The band below the front, as a share of the picture's height.
const BAND = 0.22;
const DURATION_MS = 1300;

const running = new WeakMap<HTMLElement, () => void>();

/** Where an object-fit picture actually lands inside its box. */
function contentRect(img: HTMLImageElement, w: number, h: number) {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const style = getComputedStyle(img);
  const scale = style.objectFit === "cover" ? Math.max(w / nw, h / nh) : Math.min(w / nw, h / nh);
  const dw = nw * scale;
  const dh = nh * scale;
  const [px, py] = style.objectPosition.split(" ").map((v) => (v.endsWith("%") ? parseFloat(v) / 100 : NaN));
  const fx = Number.isNaN(px) ? 0.5 : px;
  const fy = Number.isNaN(py) ? 0.5 : py;
  return { x: (w - dw) * fx, y: (h - dh) * fy, w: dw, h: dh };
}

// A stable random number per block, so the dither does not shimmer.
function hash(col: number, row: number): number {
  const s = Math.sin(col * 12.9898 + row * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** The slide whose picture is the one showing in the card's track. */
function showingSlide(cell: HTMLElement): HTMLElement | null {
  const track = cell.querySelector<HTMLElement>(".ccard__track");
  if (!track) return null;
  const left = track.getBoundingClientRect().left;
  let best: HTMLElement | null = null;
  let bestDist = Infinity;
  for (const slide of track.querySelectorAll<HTMLElement>(".ccard__slide")) {
    const d = Math.abs(slide.getBoundingClientRect().left - left);
    if (d < bestDist) {
      bestDist = d;
      best = slide;
    }
  }
  return best;
}

export function cancelPixelReveal(cell: HTMLElement): void {
  running.get(cell)?.();
}

export function pixelReveal(cell: HTMLElement): void {
  cancelPixelReveal(cell);
  const slide = showingSlide(cell);
  const img = slide?.querySelector<HTMLImageElement>(".ccard__img");
  if (!slide || !img || !img.complete || !img.naturalWidth) return;
  const box = slide.getBoundingClientRect();
  if (!box.width || !box.height) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  canvas.className = "ccard__pixels";
  canvas.setAttribute("aria-hidden", "true");
  canvas.width = Math.round(box.width * dpr);
  canvas.height = Math.round(box.height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.imageSmoothingEnabled = false;

  const pic = contentRect(img, box.width, box.height);
  const aspect = pic.w / pic.h;
  const small = document.createElement("canvas");
  const sctx = small.getContext("2d");
  if (!sctx) return;

  slide.appendChild(canvas);
  img.style.visibility = "hidden";

  let frame = 0;
  let lastStep = -1;
  const start = performance.now();

  const finish = () => {
    cancelAnimationFrame(frame);
    canvas.remove();
    img.style.visibility = "";
    running.delete(cell);
  };
  running.set(cell, finish);

  const draw = (now: number) => {
    const p = easeOut(Math.min(1, (now - start) / DURATION_MS));
    if (p >= 1) return finish();

    const step = Math.min(STEPS.length - 1, Math.floor(p * STEPS.length));
    if (step !== lastStep) {
      lastStep = step;
      small.width = STEPS[step];
      small.height = Math.max(1, Math.round(STEPS[step] / aspect));
      sctx.drawImage(img, 0, 0, small.width, small.height);
    }

    // The front runs from just above the picture to just below it, so the
    // dithered band crosses the whole picture too.
    const front = p * (1 + 2 * BAND) - BAND;
    const ecols = STEPS[Math.min(STEPS.length - 1, Math.floor(Math.min(p, EDGE_CAP) * STEPS.length))];
    const erows = Math.max(1, Math.round(ecols / aspect));
    const cw = pic.w / ecols;
    const ch = pic.h / erows;

    ctx.clearRect(0, 0, box.width, box.height);
    ctx.save();
    ctx.beginPath();
    for (let r = 0; r < erows; r++) {
      const y = (r + 0.5) / erows;
      if (y <= front) {
        ctx.rect(pic.x, pic.y + r * ch, pic.w, ch + 0.5);
        continue;
      }
      if (y > front + BAND) break;
      for (let c = 0; c < ecols; c++) {
        if (y <= front + BAND * hash(c, r)) ctx.rect(pic.x + c * cw, pic.y + r * ch, cw + 0.5, ch + 0.5);
      }
    }
    ctx.clip();
    ctx.drawImage(small, pic.x, pic.y, pic.w, pic.h);
    ctx.restore();
    frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);
}
