// The operator's mail: what to say, never how to send it. Pure, and
// deliberately free of firebase imports — adminDigest.ts gathers the facts
// from Firestore and Auth and hands them in as plain values, so
// tests/unit/adminDigest.test.mjs can run this from the root project without
// functions/node_modules being installed.
//
// Delivery moved off Brevo on 2026-09-22. Brevo existed because vscn.ch had
// no mailbox that could send (its MX was Cloudflare Email Routing,
// forward-only). Since 2026-09-18 the mailbox lives at Infomaniak and sends,
// so the notice now goes out through it (mail.ts) and Brevo left the code
// and the privacy policy in the same commit.

export interface AdminMessage {
  subject: string;
  text: string;
}

const PROD_PROJECT = "vscn-39508";

export function isProd(projectId: string): boolean {
  return projectId === PROD_PROJECT;
}

export function adminUrl(projectId: string): string {
  return isProd(projectId) ? "https://vscn.ch/admin" : `https://${projectId}.web.app/admin`;
}

/**
 * Everything known about a new account by the time the digest runs, which is
 * either when the wizard reports itself finished or thirty minutes after
 * Auth-create — whichever comes first (adminDigest.ts). So unlike the old
 * instant ping, this is what the person actually DID, not that they exist.
 */
export interface SignupReport {
  kind: "signup";
  uid: string;
  email: string | null;
  createdAt: Date;
  /** Auth user gone again before the digest ran. */
  deleted: boolean;
  emailVerified: boolean;
  /** users/{uid} */
  onboardingComplete: boolean;
  wantsToContribute: boolean;
  phoneGiven: boolean;
  /** publicProfiles/{uid}; null when the wizard never wrote one. */
  profile: {
    displayName: string | null;
    memberType: string | null;
    role: string | null;
    affiliation: string | null;
    location: string | null;
    portfolio: string | null;
    socialMedia: string | null;
    languages: string[];
    openTo: string[];
    visualNeeds: string[];
    primaryAudiences: string[];
    tags: string[];
    bioLength: number;
    active: boolean;
  } | null;
  /** Live images by kind, from images where ownerUid == uid. */
  images: { gallery: number; avatar: boolean };
  /** onboardingRequests/{uid}.message — the free text they addressed to us. */
  requestMessage: string | null;
}

export interface ImageReport {
  kind: "image";
  imageId: string;
  uid: string;
  ownerName: string | null;
  imageKind: string;
  /** Doc gone again (deleted or swept) before the digest ran. */
  deleted: boolean;
  caption: string | null;
  width: number | null;
  height: number | null;
  /** Public download URL derived from storagePath, when the doc still exists. */
  url: string | null;
  at: Date;
}

export type Report = SignupReport | ImageReport;

const list = (xs: string[]) => (xs.length ? xs.join(", ") : "—");
const yesno = (b: boolean) => (b ? "yes" : "no");
const stamp = (d: Date) => d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");

function signupSection(r: SignupReport, projectId: string): string[] {
  const who = r.profile?.displayName ?? r.email ?? r.uid;
  const lines = [
    `## ${who}`,
    "",
    `Email:     ${r.email ?? "(none)"}  (verified: ${yesno(r.emailVerified)})`,
    `UID:       ${r.uid}`,
    `Created:   ${stamp(r.createdAt)}`,
  ];
  if (r.deleted) {
    lines.push("", "The account was deleted again before this report ran.");
    return lines;
  }
  lines.push(`Wizard:    ${r.onboardingComplete ? "finished" : "NOT finished"}`);
  if (!r.profile) {
    lines.push("Profile:   none written — they stopped at the email step.");
  } else {
    const p = r.profile;
    lines.push(
      `Visible:   ${yesno(p.active)}`,
      `Type:      ${p.memberType ?? "—"}${p.role ? ` · ${p.role}` : ""}`,
      `Where:     ${[p.affiliation, p.location].filter(Boolean).join(", ") || "—"}`,
      `Web:       ${p.portfolio ?? "—"}`,
      `Social:    ${p.socialMedia ?? "—"}`,
      `Languages: ${list(p.languages)}`,
      `Open to:   ${list(p.openTo)}`,
      `Needs:     ${list(p.visualNeeds)}`,
      `Audiences: ${list(p.primaryAudiences)}`,
      `Tags:      ${list(p.tags)}`,
      `Bio:       ${p.bioLength ? `${p.bioLength} characters` : "empty"}`,
      `Images:    ${r.images.gallery} in the gallery, avatar ${yesno(r.images.avatar)}`,
      `Phone:     ${yesno(r.phoneGiven)} · wants to contribute: ${yesno(r.wantsToContribute)}`,
    );
  }
  if (r.requestMessage) lines.push("", "They wrote:", ...r.requestMessage.split("\n").map((l) => `> ${l}`));
  lines.push("", adminUrl(projectId));
  return lines;
}

function imageLine(r: ImageReport): string {
  const who = r.ownerName ?? r.uid;
  if (r.deleted) return `- ${who}: ${r.imageKind} image ${r.imageId} — gone again before this report`;
  const size = r.width && r.height ? ` ${r.width}×${r.height}` : "";
  const cap = r.caption ? ` — "${r.caption}"` : "";
  return [`- ${who}: ${r.imageKind}${size}${cap}`, r.url ? `  ${r.url}` : null]
    .filter((l): l is string => l !== null)
    .join("\n");
}

/**
 * One mail for everything due at this tick. The subject names the people
 * when there are few enough to name; the body puts signups first, then
 * images, one line each, so a gallery upload reads as a batch rather than
 * arriving as eight mails.
 */
export function adminDigest(reports: Report[], projectId: string): AdminMessage | null {
  if (reports.length === 0) return null;
  const signups = reports.filter((r): r is SignupReport => r.kind === "signup");
  const images = reports.filter((r): r is ImageReport => r.kind === "image");
  const env = isProd(projectId) ? "" : "[dev] ";

  const parts: string[] = [];
  if (signups.length) {
    const names = signups.map((s) => s.profile?.displayName ?? s.email ?? "someone");
    parts.push(signups.length <= 2 ? `${names.join(" and ")} signed up` : `${signups.length} people signed up`);
  }
  if (images.length) {
    const owners = [...new Set(images.map((i) => i.ownerName ?? i.uid))];
    const from = owners.length === 1 ? owners[0] : `${owners.length} members`;
    parts.push(images.length === 1 ? `an image from ${from}` : `${images.length} images from ${from}`);
  }
  const subject = `${env}VSCN: ${parts.join("; ")}`;

  const body: string[] = [`Project: ${projectId}`, ""];
  if (signups.length) {
    body.push("# New accounts", "");
    for (const s of signups) body.push(...signupSection(s, projectId), "");
  }
  if (images.length) {
    body.push("# Images that went live", "", ...images.map(imageLine), "", adminUrl(projectId));
  }
  return { subject, text: body.join("\n").trimEnd() + "\n" };
}

export type SendFn = (msg: AdminMessage) => Promise<void>;

/**
 * Best-effort: false and a report through `onError` instead of a throw. The
 * digest keeps its queue on false and tries again next tick; nothing about a
 * member's account ever depends on this mail leaving.
 */
export async function deliver(send: SendFn, msg: AdminMessage, onError: (detail: string) => void = () => {}): Promise<boolean> {
  try {
    await send(msg);
    return true;
  } catch (err) {
    onError(`Mail not sent: ${String(err)}`);
    return false;
  }
}
