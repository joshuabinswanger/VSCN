/** A stale build cannot acknowledge edits committed after its snapshot began. */
export async function acknowledgePublication(db, revision, fields) {
  if (!revision) return false;
  return db.runTransaction(async tx => {
    const ref = db.doc('rebuildQueue/site');
    const snap = await tx.get(ref);
    if (snap.data()?.revision !== revision) return false;
    tx.update(ref, {
      dirtyAt: fields.delete(), leaseUntil: fields.delete(),
      publishedRevision: revision, publishedAt: fields.serverTimestamp(),
    });
    return true;
  });
}
