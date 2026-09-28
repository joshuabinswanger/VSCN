import { saveGalleryRecords, type GalleryItem } from "./gallery.ts";
import { saveProjects } from "./projectStore.ts";
import { emptiedStoredIds, writtenProjectIds, projectLabel, toProjectRecord, type EditorProject } from "./projectEditor.ts";
import type { Lang } from "../i18n/utils";

/** Projects must exist before image references are written. Partial success stays retryable. */
export async function persistWorkMetadata(uid: string, gallery: GalleryItem[], projects: EditorProject[],
  storedProjectIds: Set<string>, deletedProjectIds: Set<string>, lang: Lang, s: Record<string, string>) {
  const used = projects.filter((p) => gallery.some((g) => g.projectId === p.projectId));
  // What the delete step may remove, decided NOW from the state Save
  // read — not from whatever is dragged during the awaits below.
  const emptiedAtStart = emptiedStoredIds(gallery, projects, storedProjectIds, deletedProjectIds);
  const projectFailures = await saveProjects(uid, used.map(toProjectRecord), storedProjectIds);
  // The ones that DID go are stored now, failure or not: allSettled
  // means A can be created while B is refused, and forgetting A would
  // have the next Save create it again — a fresh createdAt on an
  // existing document, which the rules pin, so A would be refused on
  // every Save until reload.
  for (const id of writtenProjectIds(used, projectFailures)) storedProjectIds.add(id);
  if (projectFailures.length > 0) {
    projectFailures.forEach((f) => console.warn(`[projects] ${f.projectId} not saved:`, f.error));
    throw new Error(
      projectFailures
        .map((f) =>
          s["profile.project.saveFailed"].replace("{name}", projectLabel(projects, f.projectId, lang, s["profile.project.untitled"])),
        )
        .join(" "),
    );
  }

  // THE RECORDS FIRST, AND HARD (2026-09-07). Until today this ran after
  // the profile write as best-effort — a failed record write was a
  // console.warn under a green "Changes saved", tolerable only because
  // the array carried the same text. The array carries nothing now: a
  // refused record write is a caption gone. So it runs first, and a
  // failure is THE Save error, naming the image by its position.
  const recordFailures = await saveGalleryRecords(gallery);
  if (recordFailures.length > 0) {
    recordFailures.forEach((f) =>
      console.warn(`[gallery] record ${f.imageId} not saved:`, f.error)
    );
    throw new Error(
      [
        ...recordFailures.map((f) =>
          s["profile.gallery.saveFailed"].replace("{n}", String(f.index + 1))
        ),
        s["profile.gallery.saveFailed.tail"],
      ].join(" ")
    );
  }

  return emptiedAtStart;
}
