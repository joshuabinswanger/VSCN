// Firestore I/O for projects — the thin, untested edge of
// documentation/20260923-projects-design.md. Every decision about WHAT is
// written is made by projectFields() in the pure module; this file only
// decides create vs update and turns an absent field into deleteField().
import {
  collection, deleteDoc, deleteField, doc, documentId, getDocs, query, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { db } from "./firebase.ts";
import { projectFields, type ProjectFields, type ProjectRecord } from "./projects.ts";
import { isProfileVisible } from "./profileVisibility.ts";

/**
 * Every key an update sets or deletes. Exported for the rules test, which runs
 * saveProjects() itself against the emulator: a key added here (and to
 * projectFields) but not to validProject() in firestore.rules fails CI there.
 */
export const EDITABLE = ["title", "titleDe", "description", "descriptionDe", "link", "affiliations"] as const;

export async function loadProjects(uid: string): Promise<ProjectRecord[]> {
  const snap = await getDocs(query(collection(db, "projects"), where("ownerUid", "==", uid)));
  return snap.docs.map((d) => ({ projectId: d.id, ...(d.data() as Omit<ProjectRecord, "projectId">) }));
}

export interface ProjectSaveFailure {
  projectId: string;
  error: unknown;
}

/**
 * Creates the new ones, updates the stored ones. allSettled, like
 * saveGalleryRecords(): one refused project must not stop the rest, and each
 * refusal comes back so Save can name it instead of printing "Changes saved".
 */
export async function saveProjects(
  uid: string,
  projects: readonly (ProjectFields & { projectId: string })[],
  storedIds: ReadonlySet<string>,
): Promise<ProjectSaveFailure[]> {
  const results = await Promise.allSettled(
    projects.map((p) => {
      const fields = projectFields(p);
      const ref = doc(db, "projects", p.projectId);
      if (!storedIds.has(p.projectId)) {
        return setDoc(ref, { ownerUid: uid, ...fields, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }
      const update: Record<string, unknown> = { updatedAt: serverTimestamp() };
      for (const key of EDITABLE) update[key] = fields[key] ?? deleteField();
      return updateDoc(ref, update);
    }),
  );
  return results.flatMap((r, i) => (r.status === "rejected" ? [{ projectId: projects[i].projectId, error: r.reason }] : []));
}

export async function deleteProjects(ids: readonly string[]): Promise<ProjectSaveFailure[]> {
  const results = await Promise.allSettled(ids.map((id) => deleteDoc(doc(db, "projects", id))));
  return results.flatMap((r, i) => (r.status === "rejected" ? [{ projectId: ids[i], error: r.reason }] : []));
}

export interface MemberOption {
  uid: string;
  name: string;
}

/** Every visible member, for the affiliation type-ahead. publicProfiles is public read and small. */
export async function loadMemberOptions(): Promise<MemberOption[]> {
  const snap = await getDocs(collection(db, "publicProfiles"));
  return snap.docs
    .filter((d) => isProfileVisible(d.data()))
    .map((d) => ({ uid: d.id, name: String(d.data().displayName ?? "").trim() }))
    .filter((m) => m.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Current slugs for the preview's member-credit links — VISIBLE members only,
 * as the build resolves them (resolveMemberCredits is handed directory slugs
 * only). A slug outlives hiding, so the slugs query alone had the preview link
 * a credit the page renders as plain text (final review, 2026-09-24).
 * Visibility is asked of publicProfiles here, so every caller gets it.
 * `in` takes at most 30 values.
 */
export async function memberSlugs(uids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(uids)];
  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30);
    const profiles = await getDocs(query(collection(db, "publicProfiles"), where(documentId(), "in", chunk)));
    const visible = profiles.docs.filter((d) => isProfileVisible(d.data())).map((d) => d.id);
    if (!visible.length) continue;
    const snap = await getDocs(query(collection(db, "slugs"), where("uid", "in", visible)));
    for (const d of snap.docs) if (d.data().current === true) out.set(String(d.data().uid), d.id);
  }
  return out;
}
