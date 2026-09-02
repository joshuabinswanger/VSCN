import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase.ts";

// Shapes mirror functions/src/adminOps.ts; Timestamps arrive as ISO strings.
export interface AuthSummary {
  uid: string; email: string | null; emailVerified: boolean; disabled: boolean;
  createdAt: string; lastSignInAt: string | null; admin: boolean;
}
export interface AdminImage {
  imageId: string; ownerUid: string; kind: "avatar" | "gallery"; storagePath: string;
  width: number; height: number; color?: string; caption?: string; description?: string;
  origin: "member" | "curated"; status: "uploading" | "live" | "pendingDeletion"; createdAt: string;
}
export interface DeletionJobView {
  uid: string; requestedBy: string; requestedAt: string; purgeAfter: string; activeBefore: boolean;
  imageIds: string[];
  steps: { imagesDeleted: boolean; filesDeleted: boolean; docsDeleted: boolean; authDeleted: boolean };
  completedAt: string | null; lastError: string | null;
}
export interface MemberGraph {
  uid: string;
  auth: AuthSummary | null;
  user: Record<string, unknown> | null;
  publicProfile: Record<string, unknown> | null;
  images: AdminImage[];
  onboardingRequest: Record<string, unknown> | null;
  deletion: DeletionJobView | null;
  slugs: { slug: string; current: boolean }[];
}
export interface LookupResult {
  graph: MemberGraph | null;
  matches: { uid: string; displayName: string; active: boolean }[];
}
export interface Queues {
  pendingDeletions: DeletionJobView[];
  staleUploads: AdminImage[];
  emailMismatches: { uid: string; storedEmail: string | null; authEmail: string }[];
}

const call = <Req, Res>(name: string) => async (data: Req): Promise<Res> =>
  (await httpsCallable<Req, Res>(functions, name)(data)).data;

export const lookupMember = call<{ query: string }, LookupResult>("adminLookupMember");
export const listQueues = call<void, Queues>("adminListQueues");
export const purgeAccount = call<{ uid: string; immediate?: boolean }, { ok: true; purgeAfter: string }>("adminPurgeAccount");
export const restoreAccount = call<{ uid: string }, { ok: true }>("adminRestoreAccount");
export const setMemberEmail = call<{ uid: string; email: string }, { ok: true }>("adminSetMemberEmail");
export const setProfileActive = call<{ uid: string; active: boolean }, { ok: true }>("adminSetProfileActive");
