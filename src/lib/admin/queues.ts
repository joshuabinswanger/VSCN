/**
 * The housekeeping queues: the publication queue's age, pending deletions,
 * stale uploads, live records no profile points at, email mismatches and the
 * operator's unsent notices. Every member row jumps to the member it belongs
 * to, and image rows also jump to the record and carry the delete control.
 */
import type { AdminImage, Queues } from "../adminApi.ts";
import { retryNotice } from "../adminApi.ts";
import { type Child, el, fmt, linkBtn } from "./dom.ts";

export interface QueueDeps {
  go(hash: string): void;
  memberName(uid: string): string | undefined;
  deleteImageButton(img: AdminImage, after: () => Promise<void>): HTMLButtonElement;
  /** Re-fetch the queues after a delete — the counts in the headings are part of what the page is for. */
  refresh(): Promise<void>;
  crumbs(...extra: Child[]): HTMLElement;
  imageCache: Map<string, AdminImage>;
}

/**
 * Everything that wants a human's decision, as one number for the badge. A
 * notice merely waiting for its tick is not in it; one the mailbox refused is,
 * because nothing else will ever tell you.
 */
export const failingNotices = (q: Queues) => q.unsentNotices.filter((n) => n.attempts > 0);
/** Retained after the last automatic attempt; nothing but a Retry moves these. Counted server-side since 2026-09-29, derived from the rows before. */
export const retainedNotices = (q: Queues): number => q.failedNotices ?? q.unsentNotices.filter((n) => n.failed).length;
export const queueTotal = (q: Queues): number =>
  q.pendingDeletions.length + q.staleUploads.length + q.unreferencedLive.length + q.emailMismatches.length +
  failingNotices(q).length + (q.publication?.delayed ? 1 : 0);

export function renderQueues(q: Queues, deps: QueueDeps): HTMLElement {
  const retry = (id: string) => {
    const status = el("span", { role: "status" });
    const button = linkBtn("Retry delivery", async () => {
      button.disabled = true;
      try { await retryNotice({ id }); await deps.refresh(); }
      catch { status.textContent = "Retry failed. Please try again."; button.disabled = false; }
    });
    return el("span", {}, button, status);
  };
  const memberLink = (uid: string) =>
    linkBtn(deps.memberName(uid) || uid, () => deps.go(`#uid/${encodeURIComponent(uid)}`));
  const imageLink = (imageId: string) =>
    linkBtn(imageId, () => deps.go(`#image/${encodeURIComponent(imageId)}`));

  const imageRow = (i: AdminImage, note: string) => {
    deps.imageCache.set(i.imageId, i);
    return el("div", { class: "row" },
      el("span", {}, imageLink(i.imageId), ` · ${note}`),
      el("span", { class: "row-actions" },
        // Straight from the queue, because that is where you are when you
        // decide a queue should be shorter.
        deps.deleteImageButton(i, deps.refresh),
        memberLink(i.ownerUid)));
  };

  const heading = (title: string, n: number, hint: string) =>
    el("div", { class: "qhead" },
      el("h2", {}, `${title} `, el("span", { class: `tag${n ? " tag--warn" : ""}` }, String(n))),
      el("p", { class: "muted small" }, hint));
  const empty = (n: number) => (n ? null : el("p", { class: "muted" }, "Nothing here."));

  // The site's own queue: one row, because "is the site behind, and since
  // when" is the question nobody could answer from the console before
  // (review T2-9). An old callable answers without it; then the row says so.
  const p = q.publication;
  const publication = !p
    ? el("p", { class: "muted" }, "Not reported by this deployment.")
    : el("div", { class: "row" },
        el("span", {},
          p.dirty
            ? el("span", { class: p.delayed ? "error" : "" },
                `${p.delayed ? "DELAYED" : "queued"} ${p.ageMinutes ?? 0} min · oldest ${fmt(p.queuedAt)} · newest ${fmt(p.dirtyAt)}`,
                p.leaseUntil ? ` · build in flight until ${fmt(p.leaseUntil)}` : " · waiting for the next flush")
            : `up to date · published ${p.publishedAt ? fmt(p.publishedAt) : "never"}`,
          ` · generation ${p.publishedGeneration} of ${p.generation}`));

  return el("div", { class: "card" },
    deps.crumbs(),
    heading("Publication", p?.delayed ? 1 : 0,
      `Member changes waiting for a site build. Older than ${p?.delayedAfterMinutes ?? 30} minutes counts as delayed: the flush logs an error and members are told.`),
    publication,

    heading("Pending deletions", q.pendingDeletions.length, "Accounts in a grace period or with a stalled purge."),
    ...q.pendingDeletions.map((j) => el("div", { class: "row" },
      el("span", {}, `purge after ${fmt(j.purgeAfter)} · by ${j.requestedBy}`,
        j.lastError ? el("span", { class: "error" }, ` · ERROR ${j.lastError}`) : null),
      memberLink(j.uid))),
    empty(q.pendingDeletions.length),

    heading("Stale uploads", q.staleUploads.length, "Records still `uploading` long after they were created — the bytes never arrived."),
    ...q.staleUploads.map((i) => imageRow(i, fmt(i.createdAt))),
    empty(q.staleUploads.length),

    heading("Unreferenced live records", q.unreferencedLive.length,
      "Finished uploads that no gallery array or photoImageId points at. No sweeper takes these; a human decides."),
    ...q.unreferencedLive.map((i) => imageRow(i, `${i.kind} · ${fmt(i.createdAt)}`)),
    empty(q.unreferencedLive.length),

    heading("Email mismatches", q.emailMismatches.length, "The users/ mirror disagrees with Firebase Auth."),
    ...q.emailMismatches.map((m) => el("div", { class: "row" },
      el("span", {}, `mirror ${m.storedEmail ?? "—"} ≠ auth ${m.authEmail}`), memberLink(m.uid))),
    empty(q.emailMismatches.length),

    // The count is the failing ones, like the badge; the list is all of them,
    // because "why has the signup from ten minutes ago not reached me" is
    // answered by the row that says it is waiting for the wizard.
    heading("Unsent notices", failingNotices(q).length,
      `Operator mails awaiting delivery. After ${q.noticeMaxAttempts} failed sends, notices are retained here for manual retry` +
      `${retainedNotices(q) ? ` — ${retainedNotices(q)} retained now` : ""}.`),
    ...q.unsentNotices.map((n) => el("div", { class: "row" },
      el("span", {},
        n.kind === "image" && n.imageId ? el("span", {}, "image ", imageLink(n.imageId)) : `signup${n.email ? ` ${n.email}` : ""}`,
        ` · queued ${fmt(n.at)} · `,
        n.attempts > 0
          ? el("span", { class: "error" },
              `failed ${n.attempts} of ${q.noticeMaxAttempts}, last ${fmt(n.lastAttemptAt)}`,
              n.lastError ? ` · ${n.lastError}` : "")
          : Date.parse(n.dueAt) > Date.now() ? `waiting until ${fmt(n.dueAt)}` : "goes with the next digest"),
      el("span", { class: "row-actions" }, n.failed ? retry(n.id) : null, memberLink(n.uid)))),
    empty(q.unsentNotices.length),
  );
}
