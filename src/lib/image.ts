export const WEBP_QUALITY = 0.82;

/** Decode any supported image; bakes in EXIF orientation. Canvas re-encode later strips metadata. */
export async function decodeImage(source: File | Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This image could not be read. Please try a JPEG, PNG, or WebP export.");
  }
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
