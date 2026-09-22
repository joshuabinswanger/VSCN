import { createTransport } from "nodemailer";
import { defineSecret, defineString } from "firebase-functions/params";
import type { AdminMessage } from "./notify";

// Outbound mail is the vscn.ch mailbox itself, submitted to Infomaniak the
// way a mail client would: STARTTLS on 587, authenticated as the box. The
// password is a Secret Manager secret the operator sets per project — the
// code never sees it outside the runtime:
//   npx -y firebase-tools@latest functions:secrets:set INFOMANIAK_SMTP_PASSWORD
//   npx -y firebase-tools@latest functions:secrets:set ADMIN_NOTIFY_TO
// The recipient is a secret rather than a functions/.env param because the
// repo is public and it is a private mailbox. Infomaniak only lets a session
// send as the mailbox (or an alias of it) that authenticated, which is why
// the default sender is info@ and not the old notifications@.
export const smtpPassword = defineSecret("INFOMANIAK_SMTP_PASSWORD");
export const adminNotifyTo = defineSecret("ADMIN_NOTIFY_TO");
const smtpHost = defineString("SMTP_HOST", { default: "mail.infomaniak.com" });
const smtpUser = defineString("SMTP_USER", { default: "info@vscn.ch" });
const notifyFrom = defineString("NOTIFY_FROM", { default: "VSCN <info@vscn.ch>" });

/** One plain-text message to the operator. Throws on failure; notify.deliver() is the catch. */
export async function sendToOperator(msg: AdminMessage): Promise<void> {
  const transport = createTransport({
    host: smtpHost.value(),
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: smtpUser.value(), pass: smtpPassword.value() },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  try {
    await transport.sendMail({ from: notifyFrom.value(), to: adminNotifyTo.value(), subject: msg.subject, text: msg.text });
  } finally {
    transport.close();
  }
}
