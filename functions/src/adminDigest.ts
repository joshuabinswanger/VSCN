import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, db, getBucket } from "./admin";
import { adminNotifyTo, sendToOperator, smtpPassword } from "./mail";
import { adminDigest, deliver, type ImageReport, type Report, type SignupReport } from "./notify";
import type { ImageDoc } from "./types";

// The operator's notices are a QUEUE, not a mail per trigger. Triggers write
// a small document into adminEvents/ (server-only: the rules' default deny
// applies); a schedule reads what is due, looks the facts up at THAT moment,
// sends one mail and deletes the events it covered. Two things fall out:
//
// - A signup is reported once the wizard says it is finished, or thirty
//   minutes after Auth-create for someone who never finished — so the mail
//   describes what the person did, not merely that an Auth user appeared
//   (the 2026-09-10 ping fired at wizard step 1 and knew only the address).
// - A gallery of twelve uploads becomes one mail listing twelve images, not
//   twelve mails.

/** How long an unfinished signup waits before it is reported as unfinished. */
export const SIGNUP_REPORT_DELAY_MINUTES = 30;
/** Ticks a mail may fail before its events are dropped with an error, so a dead mailbox does not queue forever. */
export const MAX_ATTEMPTS = 12;
const BATCH = 100;
/** The SMTP reply is the finding; a stack trace is not, and a row has to fit on screen. */
const ERROR_CHARS = 500;

type EventKind = "signup" | "image";

interface AdminEvent {
  kind: EventKind;
  uid: string;
  at: Timestamp;
  /** Earliest tick that may report it. Signups: at + delay; images: at. */
  dueAt: Timestamp;
  attempts: number;
  imageId?: string;
  email?: string | null;
  /** Why the last tick's mail did not go, so the console can say it (a 535 sat in the logs for a day). */
  lastError?: string;
  lastAttemptAt?: Timestamp;
}

/**
 * What the admin console's Queues tab shows as "Unsent notices": every event
 * still waiting, oldest first — the ones not yet due, and the ones a failing
 * mailbox keeps putting back. Read here rather than in adminOps.ts so the
 * queue's shape has one owner.
 */
export async function listUnsentNotices(): Promise<(AdminEvent & { id: string })[]> {
  const snap = await db.collection("adminEvents").orderBy("at").limit(BATCH).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as AdminEvent) }));
}

export async function queueSignup(uid: string, email: string | null | undefined, createdAt: Date): Promise<void> {
  const at = Timestamp.fromDate(createdAt);
  await db.doc(`adminEvents/signup-${uid}`).set({
    kind: "signup",
    uid,
    email: email ?? null,
    at,
    dueAt: Timestamp.fromMillis(at.toMillis() + SIGNUP_REPORT_DELAY_MINUTES * 60_000),
    attempts: 0,
  } satisfies AdminEvent);
}

/**
 * An image counts as uploaded when its record crosses into `live`
 * (completeImageUpload, uploads.ts) — caption edits stay `live` and do not
 * fire, and a slot reopened for a replacement goes uploading → live again,
 * which is an upload. Curated seedings (origin !== "member") are ours and
 * need no notice.
 */
export const onImageWentLive = onDocumentWritten({ document: "images/{imageId}", retry: true }, async (event) => {
  const before = event.data?.before.data() as Partial<ImageDoc> | undefined;
  const after = event.data?.after.data() as Partial<ImageDoc> | undefined;
  if (!after || after.status !== "live" || before?.status === "live") return;
  if (after.origin !== "member" || typeof after.ownerUid !== "string") return;
  // A hidden member's pictures never reach the site, so they are not the
  // operator's news either. The release walk uploads and deletes one image
  // per release as exactly such a member
  // (documentation/20260923-release-walk-automation.md §7).
  const owner = await db.doc(`publicProfiles/${after.ownerUid}`).get();
  if (owner.data()?.moderationHidden === true) return;
  const now = Timestamp.now();
  await db.doc(`adminEvents/image-${event.params.imageId}-${now.toMillis()}`).set({
    kind: "image",
    uid: after.ownerUid,
    imageId: event.params.imageId,
    at: now,
    dueAt: now,
    attempts: 0,
  } satisfies AdminEvent);
});

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

async function signupReport(ev: AdminEvent): Promise<SignupReport> {
  const [authUser, userSnap, profileSnap, requestSnap, liveImages] = await Promise.all([
    adminAuth.getUser(ev.uid).catch(() => null),
    db.doc(`users/${ev.uid}`).get(),
    db.doc(`publicProfiles/${ev.uid}`).get(),
    db.doc(`onboardingRequests/${ev.uid}`).get(),
    db.collection("images").where("ownerUid", "==", ev.uid).where("status", "==", "live").get(),
  ]);
  const user = userSnap.data() ?? {};
  const p = profileSnap.data();
  return {
    kind: "signup",
    uid: ev.uid,
    email: authUser?.email ?? str(user.email) ?? ev.email ?? null,
    createdAt: ev.at.toDate(),
    deleted: authUser === null,
    emailVerified: authUser?.emailVerified ?? false,
    onboardingComplete: user.onboardingComplete === true,
    wantsToContribute: user.wantsToContribute === true,
    phoneGiven: str(user.phone) !== null,
    profile: p
      ? {
          displayName: str(p.displayName),
          memberType: str(p.memberType),
          role: str(p.role),
          affiliation: str(p.affiliation),
          location: str(p.location),
          portfolio: str(p.portfolio),
          socialMedia: str(p.socialMedia),
          languages: strs(p.languages),
          openTo: strs(p.openTo),
          visualNeeds: strs(p.visualNeeds),
          primaryAudiences: strs(p.primaryAudiences),
          tags: strs(p.tags),
          bioLength: str(p.bio)?.length ?? 0,
          active: p.active === true,
        }
      : null,
    images: {
      gallery: liveImages.docs.filter((d) => d.data().kind === "gallery").length,
      avatar: liveImages.docs.some((d) => d.data().kind === "avatar"),
    },
    requestMessage: str(requestSnap.data()?.message),
  };
}

async function imageReport(ev: AdminEvent): Promise<ImageReport> {
  const imageId = ev.imageId ?? "";
  const [imageSnap, profileSnap] = await Promise.all([db.doc(`images/${imageId}`).get(), db.doc(`publicProfiles/${ev.uid}`).get()]);
  const img = imageSnap.data() as Partial<ImageDoc> | undefined;
  const live = img?.status === "live";
  const url = live && typeof img?.storagePath === "string"
    ? `https://firebasestorage.googleapis.com/v0/b/${getBucket().name}/o/${encodeURIComponent(img.storagePath)}?alt=media`
    : null;
  return {
    kind: "image",
    imageId,
    uid: ev.uid,
    ownerName: str(profileSnap.data()?.displayName),
    imageKind: str(img?.kind) ?? "image",
    deleted: !live,
    caption: str(img?.caption),
    width: typeof img?.width === "number" ? img.width : null,
    height: typeof img?.height === "number" ? img.height : null,
    url,
    at: ev.at.toDate(),
  };
}

/**
 * Which queued events this tick may report. Images: as soon as they exist.
 * Signups: once due, or earlier the moment users/{uid}.onboardingComplete
 * is true — the finished ones need not wait out the half hour.
 */
async function dueEvents(now: Timestamp): Promise<{ id: string; ev: AdminEvent }[]> {
  const snap = await db.collection("adminEvents").orderBy("at").limit(BATCH).get();
  const out: { id: string; ev: AdminEvent }[] = [];
  for (const d of snap.docs) {
    const ev = d.data() as AdminEvent;
    if (ev.dueAt.toMillis() <= now.toMillis()) {
      out.push({ id: d.id, ev });
      continue;
    }
    if (ev.kind === "signup") {
      const user = await db.doc(`users/${ev.uid}`).get();
      if (user.data()?.onboardingComplete === true) out.push({ id: d.id, ev });
    }
  }
  return out;
}

export const sendAdminDigest = onSchedule(
  { schedule: "every 10 minutes", secrets: [smtpPassword, adminNotifyTo], maxInstances: 1, timeoutSeconds: 120 },
  async () => {
    const now = Timestamp.now();
    const due = await dueEvents(now);
    if (due.length === 0) return;
    const projectId = process.env.GCLOUD_PROJECT ?? "unknown-project";

    const reports: Report[] = [];
    for (const { ev } of due) {
      reports.push(ev.kind === "signup" ? await signupReport(ev) : await imageReport(ev));
    }
    const msg = adminDigest(reports, projectId);
    if (!msg) return;

    let failure = "";
    const ok = await deliver(sendToOperator, msg, (detail) => {
      failure = detail;
      logger.error("Admin digest not sent", { events: due.length, detail });
    });
    const batch = db.batch();
    for (const { id, ev } of due) {
      const ref = db.doc(`adminEvents/${id}`);
      if (ok || ev.attempts + 1 >= MAX_ATTEMPTS) batch.delete(ref);
      else batch.update(ref, { attempts: FieldValue.increment(1), lastError: failure.slice(0, ERROR_CHARS), lastAttemptAt: now });
    }
    await batch.commit();
    if (ok) logger.info("Admin digest sent", { events: due.length, subject: msg.subject });
    else if (due.some(({ ev }) => ev.attempts + 1 >= MAX_ATTEMPTS)) logger.error("Admin digest events dropped after repeated failures", { events: due.length });
  },
);
