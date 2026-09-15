// BUILD TIME ONLY. The export step writes a sanitized, public-only snapshot
// before Astro starts, so image optimization never runs with Firebase credentials.
import { requireBuildEnvironment } from "./buildEnvironment.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PublicProfileDoc } from "./firestore.ts";
import { resolveSlugs, toMemberViewBase, type MemberView } from "./memberView.ts";
import type { GalleryRecord } from "./galleryRecords.ts";
import { isProfileVisible } from "./profileVisibility.ts";

interface Directory {
  members: MemberView[];
  aliases: { slug: string; uid: string }[];
}

export interface SiteSnapshot {
  version: 1;
  projectId: string;
  bucket: string;
  generatedAt: string;
  profiles: { id: string; data: PublicProfileDoc }[];
  slugs: { slug: string; uid: string; current: boolean }[];
  images: GalleryRecord[];
}

let directoryPromise: Promise<Directory> | null = null;

function fetchDirectory(): Directory {
  requireBuildEnvironment({ ...import.meta.env, MEMBER_DIRECTORY_SNAPSHOT: ".site-data.json" });
  // Missing or malformed data must fail the build. An empty directory would
  // otherwise silently deploy when the export credential or network fails.
  const snapshot = JSON.parse(readFileSync(resolve(process.cwd(), ".site-data.json"), "utf8")) as SiteSnapshot;
  if (snapshot.version !== 1 || !Array.isArray(snapshot.profiles)
    || !Array.isArray(snapshot.slugs) || !Array.isArray(snapshot.images)
    || typeof snapshot.bucket !== "string" || typeof snapshot.projectId !== "string"
    || !Number.isFinite(Date.parse(snapshot.generatedAt))
    || Math.abs(Date.now() - Date.parse(snapshot.generatedAt)) > 60 * 60_000) {
    throw new Error("Site data export is missing, malformed, or stale.");
  }
  const expectedProject = import.meta.env.PUBLIC_FIREBASE_PROJECT_ID;
  if (expectedProject && snapshot.projectId !== expectedProject) {
    throw new Error("Site data project does not match the build configuration.");
  }

  const recordsByOwner = new Map<string, GalleryRecord[]>();
  for (const rec of snapshot.images) {
    const list = recordsByOwner.get(rec.ownerUid) ?? [];
    list.push(rec);
    recordsByOwner.set(rec.ownerUid, list);
  }
  const current = new Map<string, string>();
  const retired: { slug: string; uid: string }[] = [];
  for (const row of snapshot.slugs) {
    if (row.current) current.set(row.uid, row.slug);
    else retired.push({ slug: row.slug, uid: row.uid });
  }
  const members = resolveSlugs(
    snapshot.profiles
      .filter((profile) => isProfileVisible(profile.data))
      .map((profile) => toMemberViewBase(profile.id, profile.data, recordsByOwner.get(profile.id) ?? [], snapshot.bucket)),
    current,
  );
  const activeUids = new Set(members.map((member) => member.id));
  return { members, aliases: retired.filter((alias) => activeUids.has(alias.uid)) };
}

export async function fetchMemberViews(): Promise<MemberView[]> {
  directoryPromise ??= Promise.resolve().then(fetchDirectory);
  return (await directoryPromise).members;
}

export async function fetchSlugAliases(): Promise<{ slug: string; uid: string }[]> {
  directoryPromise ??= Promise.resolve().then(fetchDirectory);
  return (await directoryPromise).aliases;
}
