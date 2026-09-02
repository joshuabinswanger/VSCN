import { decodeImage } from "./image.ts";

export interface EditorLabels {
  rotate: string;
  apply: string;
  cancel: string;
}

/**
 * Modal rotate editor. Rotation in 90° steps; resolves an edited PNG blob, or
 * null on cancel / no changes. Lossless: WebP compression happens in the
 * existing pipeline afterwards.
 *
 * CROPPING IS GONE (2026-09-02, Josh: "drop cropping"). Dragging a rectangle
 * on the canvas used to cut the image down before upload, and it was the wrong
 * tool in the wrong place: every surface on this site frames artwork at its
 * TRUE aspect and narrows tall work rather than cutting it (see .ccard__frame
 * and .cwork__frame), so a crop here was the one thing in the pipeline that
 * could throw away picture — irreversibly, since only the cropped result is
 * uploaded. Members crop in the tool they made the work in.
 *
 * Rotation stays because it fixes an image rather than editing it: a portrait
 * that arrives on its side has nothing to do with how it was composed.
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

  const MAX_VIEW = 640;

  // Preview only — the canvas is scaled to fit the dialog, and `apply` renders
  // the turn again at full resolution below.
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
  }

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
      draw();
    });
    dialog.querySelector('[data-act="apply"]')!.addEventListener("click", () => {
      if (quarterTurns === 0) return finish(null); // nothing changed
      // Render full-resolution: the preview canvas is a scaled view, so the
      // turn is applied again to the original bitmap rather than read back off
      // the canvas the member was looking at.
      const rotated = quarterTurns % 2 === 1;
      const full = document.createElement("canvas");
      full.width = rotated ? bitmap.height : bitmap.width;
      full.height = rotated ? bitmap.width : bitmap.height;
      const fctx = full.getContext("2d")!;
      fctx.translate(full.width / 2, full.height / 2);
      fctx.rotate((quarterTurns * Math.PI) / 2);
      fctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
      full.toBlob((b) => finish(b), "image/png");
    });
  });
}
