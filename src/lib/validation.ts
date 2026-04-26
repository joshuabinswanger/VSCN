const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB

export function validateAvatar(file: File): { ok: boolean; error?: string } {
  if (file.size > MAX_AVATAR_BYTES) {
    return { ok: false, error: "Image must be under 2MB." };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, error: "Only JPEG, PNG, or WebP images are allowed." };
  }
  return { ok: true };
}

export function normaliseUrl(raw: string): string {
  if (!raw) return "";
  return raw.startsWith("http") ? raw : `https://${raw}`;
}
