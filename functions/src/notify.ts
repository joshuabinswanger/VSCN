// The admin ping. Pure, and deliberately free of firebase imports: the trigger
// (authTriggers.ts) reads the params and the secret and hands the values in
// along with a fetch, so tests/unit/signupNotification.test.mjs can run this
// from the root project without functions/node_modules being installed.
//
// Delivery is Brevo's transactional REST API. vscn.ch has no mailbox that can
// send — its MX is Cloudflare Email Routing, forward-only — so a sender had to
// come from somewhere. Brevo (Sendinblue SAS, Paris) over Resend, 2026-09-10:
// an EU processor needs no transfer mechanism in the privacy policy, whereas
// a US one is a paragraph resting on the Data Privacy Framework.

export interface AdminMessage {
  subject: string;
  text: string;
}

export interface SignupEvent {
  email: string | undefined;
  uid: string;
  createdAt: Date;
  /** The Firebase project that fired — dev and prod both deploy this. */
  projectId: string;
}

const PROD_PROJECT = "vscn-39508";

/**
 * "Started signing up", not "joined": the Auth-create trigger fires at wizard
 * step 1, before verification and before the wizard is finished, so this
 * mail also arrives for every abandoned attempt. The wording keeps the inbox
 * honest about that.
 */
export function signupNotification(ev: SignupEvent): AdminMessage {
  const who = ev.email ?? "Someone";
  const env = ev.projectId === PROD_PROJECT ? "" : "[dev] ";
  const adminUrl =
    ev.projectId === PROD_PROJECT
      ? "https://vscn.ch/admin"
      : `https://${ev.projectId}.web.app/admin`;
  return {
    subject: `${env}${who} started signing up to VSCN`,
    text: [
      `A new account was created on ${ev.projectId}.`,
      "",
      `Email:   ${ev.email ?? "(none)"}`,
      `UID:     ${ev.uid}`,
      `Created: ${ev.createdAt.toISOString()}`,
      "",
      "This is wizard step 1 — the account may still be unverified or",
      "abandoned. Look the uid up in the admin console:",
      adminUrl,
    ].join("\n"),
  };
}

export interface BrevoConfig {
  apiKey: string;
  /** "Name <addr>" or a bare address; Brevo wants the two apart (parseSender). */
  from: string;
  to: string;
}

export function parseSender(from: string): { name?: string; email: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  if (!m) return { email: from.trim() };
  return m[1] ? { name: m[1], email: m[2].trim() } : { email: m[2].trim() };
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

/**
 * Best-effort: returns false and reports through `onError` instead of
 * throwing, because a broken API key or an unverified sender domain must
 * never fail the account creation the trigger rode in on.
 */
export async function sendViaBrevo(
  fetchImpl: FetchLike,
  cfg: BrevoConfig,
  msg: AdminMessage,
  onError: (detail: string) => void = () => {}
): Promise<boolean> {
  try {
    const res = await fetchImpl("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": cfg.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: parseSender(cfg.from),
        to: [{ email: cfg.to }],
        subject: msg.subject,
        textContent: msg.text,
      }),
    });
    if (!res.ok) {
      onError(`Brevo answered ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    onError(`Brevo call threw: ${String(err)}`);
    return false;
  }
}
