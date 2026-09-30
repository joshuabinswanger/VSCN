/**
 * Three-way merge of a member's gallery order (2026-09-29).
 *
 * The array on both profile docs is written WHOLESALE — order is what it
 * carries, so arrayUnion cannot express it. Until today every write was the
 * tab's own copy, so a stale tab saving an unrelated bio edit silently dropped
 * a work another session (the phone, say) had uploaded meanwhile: the record
 * stayed `live` and nothing pointed at it. updateUserProfile now reads the
 * stored array inside a transaction and reconciles through here.
 *
 * `base` is what THIS tab last saw stored (loaded, or last written by it),
 * `ours` is what it holds now, `theirs` is what Firestore holds at the moment
 * of the write. Ours keeps its order; ids another session added since base
 * are appended; ids another session removed since base leave ours — their
 * records are `pendingDeletion` and would render as broken images.
 *
 * No cap is applied on purpose: `ours` is already held to MAX_GALLERY_IMAGES,
 * and the one way past it — two sessions each filling the last slot — is a
 * write the rules refuse loudly, which beats silently dropping either work.
 */
export interface GalleryMerge {
  merged: string[];
  /** Ids another session added; the caller has no items for them yet. */
  added: string[];
  /** Ids from `ours` another session removed; the caller still shows them. */
  dropped: string[];
}

export function mergeGalleryIds(base: readonly string[], ours: readonly string[], theirs: unknown): GalleryMerge {
  // A stored value that is not an id list (missing doc, legacy shape) has
  // nothing to reconcile against: ours stands.
  if (!Array.isArray(theirs) || !theirs.every((id) => typeof id === "string")) {
    return { merged: [...ours], added: [], dropped: [] };
  }
  const stored = theirs as string[];
  const baseSet = new Set(base);
  const oursSet = new Set(ours);
  const storedSet = new Set(stored);
  const added = [...new Set(stored.filter((id) => !baseSet.has(id) && !oursSet.has(id)))];
  const dropped = ours.filter((id) => baseSet.has(id) && !storedSet.has(id));
  const droppedSet = new Set(dropped);
  const merged = [...ours.filter((id) => !droppedSet.has(id)), ...added];
  return { merged, added, dropped };
}
