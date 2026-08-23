import { decodeImage } from "./image.ts";

export interface EditorLabels {
  rotate: string;
  apply: string;
  cancel: string;
}

/**
 * Modal crop/rotate editor. Rotation in 90° steps; crop by dragging on the canvas.
 * Resolves an edited PNG blob, or null on cancel / no changes. Lossless: WebP
 * compression happens in the existing pipeline afterwards.
 */
export async function openImageEditor(file: File, labels: EditorLabels): Promise<Blob | null> {
  const bitmap = await decodeImage(file);

  const dialog = document.createElement("dialog");
  dialog.className = "image-editor";
  dialog.innerHTML = `
    <canvas></canvas>
    <div class="image-editor-actions">
      <button type="button" data-act="rotate" class="btn-outline">${labels.rotate}</button>
      <button type="button" data-act="cancel" class="btn-outline">${labels.cancel}</button>
      <button type="button" data-act="apply" class="btn-outline">${labels.apply}</button>
    </div>`;
  document.body.appendChild(dialog);

  const canvas = dialog.querySelector("canvas")!;
  const ctx = canvas.getContext("2d")!;
  let quarterTurns = 0; // 0..3
  // Crop rect in canvas coordinates; null = full image
  let crop: { x: number; y: number; w: number; h: number } | null = null;

  const MAX_VIEW = 640;

  function draw() {
    const rotated = quarterTurns % 2 === 1;
    const iw = rotated ? bitmap.height : bitmap.width;
    const ih = rotated ? bitmap.width : bitmap.height;
    const scale = Math.min(1, MAX_VIEW / Math.max(iw, ih));
    canvas.width = Math.round(iw * scale);
    canvas.height = Math.round(ih * scale);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((quarterTurns * Math.PI) / 2);
    ctx.drawImage(
      bitmap,
      (-bitmap.width * scale) / 2,
      (-bitmap.height * scale) / 2,
      bitmap.width * scale,
      bitmap.height * scale,
    );
    ctx.restore();
    if (crop) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);
      ctx.setLineDash([]);
    }
  }

  let dragStart: { x: number; y: number } | null = null;
  canvas.addEventListener("pointerdown", (e) => {
    const r = canvas.getBoundingClientRect();
    dragStart = { x: e.clientX - r.left, y: e.clientY - r.top };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragStart) return;
    const r = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(canvas.width, e.clientX - r.left));
    const y = Math.max(0, Math.min(canvas.height, e.clientY - r.top));
    crop = {
      x: Math.min(dragStart.x, x),
      y: Math.min(dragStart.y, y),
      w: Math.abs(x - dragStart.x),
      h: Math.abs(y - dragStart.y),
    };
    draw();
  });
  canvas.addEventListener("pointerup", () => {
    if (crop && (crop.w < 10 || crop.h < 10)) crop = null; // treat tiny drags as clicks
    dragStart = null;
    draw();
  });

  draw();
  dialog.showModal();

  return new Promise((resolve) => {
    function finish(result: Blob | null) {
      dialog.close();
      dialog.remove();
      bitmap.close();
      resolve(result);
    }
    dialog.addEventListener("cancel", () => finish(null)); // Esc key
    dialog.querySelector('[data-act="cancel"]')!.addEventListener("click", () => finish(null));
    dialog.querySelector('[data-act="rotate"]')!.addEventListener("click", () => {
      quarterTurns = (quarterTurns + 1) % 4;
      crop = null; // crop coordinates are meaningless after rotation
      draw();
    });
    dialog.querySelector('[data-act="apply"]')!.addEventListener("click", () => {
      if (quarterTurns === 0 && !crop) return finish(null); // nothing changed
      // Render full-resolution: rotate onto an offscreen canvas, then cut the crop.
      const rotated = quarterTurns % 2 === 1;
      const full = document.createElement("canvas");
      full.width = rotated ? bitmap.height : bitmap.width;
      full.height = rotated ? bitmap.width : bitmap.height;
      const fctx = full.getContext("2d")!;
      fctx.translate(full.width / 2, full.height / 2);
      fctx.rotate((quarterTurns * Math.PI) / 2);
      fctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
      let out = full;
      if (crop) {
        const k = full.width / canvas.width; // canvas → full-res scale factor
        const cut = document.createElement("canvas");
        cut.width = Math.round(crop.w * k);
        cut.height = Math.round(crop.h * k);
        cut
          .getContext("2d")!
          .drawImage(
            full,
            Math.round(crop.x * k),
            Math.round(crop.y * k),
            cut.width,
            cut.height,
            0,
            0,
            cut.width,
            cut.height,
          );
        out = cut;
      }
      out.toBlob((b) => finish(b), "image/png");
    });
  });
}
