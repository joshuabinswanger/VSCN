export const WEBP_QUALITY = 0.82;

// AVIF is decode-only: createImageBitmap reads it in all modern browsers; output stays WebP.
export const ALLOWED_INPUT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/** Why a file was turned away before anything tried to decode it. */
export type InputRejection = "svg" | "heic" | "type";

/** Returns why an unsupported file is rejected, or null if the type is accepted. */
export function rejectionCode(file: File): InputRejection | null {
  if (file.type === "image/svg+xml") return "svg";
  if (file.type === "image/heic" || file.type === "image/heif") return "heic";
  if (!ALLOWED_INPUT_TYPES.includes(file.type)) return "type";
  return null;
}

/**
 * The same three rejections as English sentences, for the avatar path, which
 * has no localized error vocabulary of its own.
 *
 * The gallery does not use this: it reads rejectionCode() and looks the wording
 * up in the member's own language. These strings are what a German member sees
 * today when they pick an SVG, and this is the seam through which that stops
 * being true wherever a caller can do better.
 */
const REJECTION_MESSAGES: Record<InputRejection, string> = {
  svg: "SVGs can't be uploaded. Please export your artwork as PNG or JPEG.",
  heic: "This photo is in HEIC format. Please export it as JPEG.",
  type: "Only JPEG, PNG, WebP, or AVIF images are allowed.",
};

/** Returns a user-facing error for unsupported files, or null if the type is accepted. */
export function rejectionMessage(file: File): string | null {
  const code = rejectionCode(file);
  return code ? REJECTION_MESSAGES[code] : null;
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
