const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_AVATAR_BYTES = 10 * 1024 * 1024; // 10 MB — raw upload limit before client-side resize
// Keep this in sync with validBioWordCount() in firestore.rules.
export const MAX_BIO_WORDS = 35;

export function validateAvatar(file: File): { ok: boolean; error?: string } {
  if (file.size > MAX_AVATAR_BYTES) {
    return { ok: false, error: "Image must be under 10 MB." };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, error: "Only JPEG, PNG, or WebP images are allowed." };
  }
  return { ok: true };
}

export function resizeAvatar(file: File, size = 512): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      // Cover crop: scale so the image fills the square, centered
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas export failed"));
        },
        "image/jpeg",
        0.92,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    img.src = url;
  });
}

export function normaliseUrl(raw: string): string {
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  // Reject non-http schemes (e.g. javascript:, data:)
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw)) return "";
  return `https://${raw}`;
}

export function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function validateBio(value: string): { ok: boolean; error?: string } {
  const words = countWords(value);
  if (words > MAX_BIO_WORDS) {
    return { ok: false, error: `About you must be ${MAX_BIO_WORDS} words or fewer.` };
  }
  return { ok: true };
}
