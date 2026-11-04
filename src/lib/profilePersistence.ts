import { saveGalleryRecords, type GalleryItem } from "./gallery.ts";
import { saveProjects } from "./projectStore.ts";
import { emptiedStoredIds, writtenProjectIds, projectLabel, projectRecordKey, projectsToWrite, toProjectRecord, workPlace, type EditorProject } from "./projectEditor.ts";
import { worksToWrite, type WorkWords } from "./draftMerge.ts";
import { saveErrorKind } from "./saveError.ts";
import type { Lang } from "../i18n/utils";

/**
 * A work's record did not land (audit finding 27, 2026-11-04). It carries
 * the work so the editor can take the member to it, and whether the server
 * REFUSED it: a refusal comes back the same however often it is retried, so
 * the message says to change the text instead of "try again", and the
 * autosave stops resending the same words.
 */
export class WorkSaveError extends Error {
  constructor(message: string, readonly imageId: string, readonly refused: boolean) {
    super(message);
    this.name = "WorkSaveError";
  }
}

/** What Firestore holds, as the editor last saw it: Save writes only what differs (2026-11-02). */
export interface CommittedState {
  /** Each work's words as its record holds them. Read only: the caller moves it once the whole Save has landed. */
  words: ReadonlyMap<string, WorkWords>;
  /** Works written whatever their words say — see worksToWrite. */
  mustWrite: ReadonlySet<string>;
  /** Each stored project's projectRecordKey(). Moved here, per project, as each write lands. */
  projects: Map<string, string>;
}

/** Projects must exist before image references are written. Partial success stays retryable. */
export async function persistWorkMetadata(uid: string, gallery: GalleryItem[], projects: EditorProject[],
  storedProjectIds: Set<string>, deletedProjectIds: Set<string>, committed: CommittedState, lang: Lang, s: Record<string, string>) {
  const used = projects.filter((p) => gallery.some((g) => g.projectId === p.projectId));
  // What the delete step may remove, decided NOW from the state Save
  // read — not from whatever is dragged during the awaits below.
  const emptiedAtStart = emptiedStoredIds(gallery, projects, storedProjectIds, deletedProjectIds);
  // What goes, and the keys it goes with, decided before the first await
  // for the same reason. An unchanged project or work costs nothing.
  const changedProjects = projectsToWrite(used, storedProjectIds, committed.projects);
  const keys = new Map(changedProjects.map((p) => [p.projectId, projectRecordKey(p)]));
  // Copies: the editor writes typing straight onto the gallery items, and
  // the records are written only after the project round trip. What lands
  // must be what the caller records as committed (wordsWritten), or a word
  // typed meanwhile and then undone would be stored and never seen as dirty.
  const changedWorks = worksToWrite(gallery, committed.words, committed.mustWrite)
    .map((item) => ({ ...item, ...(item.tags ? { tags: item.tags.slice() } : {}) }));
  const projectFailures = changedProjects.length
    ? await saveProjects(uid, changedProjects.map(toProjectRecord), storedProjectIds)
    : [];
  // The ones that DID go are stored now, failure or not: allSettled
  // means A can be created while B is refused, and forgetting A would
  // have the next Save create it again — a fresh createdAt on an
  // existing document, which the rules pin, so A would be refused on
  // every Save until reload.
  for (const id of writtenProjectIds(changedProjects, projectFailures)) {
    storedProjectIds.add(id);
    committed.projects.set(id, keys.get(id)!);
  }
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

  // THE RECORDS BEFORE THE PROFILE, AND HARD (2026-09-07; projects go
  // ahead of them since 2026-09-23, above). Until then this ran after the
  // profile write as best-effort — a failed record write was a
  // console.warn under a green "Changes saved", tolerable only because
  // the array carried the same text. The array carries nothing now: a
  // refused record write is a caption gone. So it runs ahead of the
  // profile, and a failure is THE Save error, naming the image by its
  // position in the gallery (not in the changed list).
  const recordFailures = changedWorks.length ? await saveGalleryRecords(changedWorks) : [];
  if (recordFailures.length > 0) {
    recordFailures.forEach((f) =>
      console.warn(`[gallery] record ${f.imageId} not saved:`, f.error)
    );
    const refused = recordFailures.find((f) => saveErrorKind(f.error) === "refused");
    const first = refused ?? recordFailures[0];
    throw new WorkSaveError(
      [
        ...recordFailures.map((f) => workPlace(gallery, projects, f.imageId, lang, s)),
        s[refused ? "profile.gallery.saveFailed.refused" : "profile.gallery.saveFailed.tail"],
      ].join(" "),
      first.imageId,
      !!refused,
    );
  }

  return emptiedAtStart;
}
