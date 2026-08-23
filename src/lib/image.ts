export const WEBP_QUALITY = 0.82;

// AVIF is decode-only: createImageBitmap reads it in all modern browsers; output stays WebP.
export const ALLOWED_INPUT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/** Returns a user-facing error for unsupported files, or null if the type is accepted. */
export function rejectionMessage(file: File): string | null {
  if (file.type === "image/svg+xml") {
    return "SVGs can't be uploaded. Please export your artwork as PNG or JPEG.";
  }
  if (file.type === "image/heic" || file.type === "image/heif") {
    return "This photo is in HEIC format. Please export it as JPEG.";
  }
  if (!ALLOWED_INPUT_TYPES.includes(file.type)) {
    return "Only JPEG, PNG, WebP, or AVIF images are allowed.";
  }
  return null;
}

/** Decode any supported image; bakes in EXIF orientation. Canvas re-encode later strips metadata. */
export async function decodeImage(source: File | Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This image could not be read. Please try a JPEG, PNG, or WebP export.");
  }
}

/** Average color via a smoothed 1x1 downscale. Lowercase #rrggbb. */
export function dominantColor(source: CanvasImageSource): string {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source, 0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function toWebpBlob(canvas: HTMLCanvasElement, quality = WEBP_QUALITY): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))),
      "image/webp",
      quality,
    );
  });
}
