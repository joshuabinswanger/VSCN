/** The mail export is fail-closed: only a stored boolean true is consent. */
export const DEFAULT_CORRESPONDENCE_LANGUAGE = "de";

/**
 * Converts a private users/{uid} record into one safe community-mail row.
 * Missing consent remains unknown and therefore cannot enter the export.
 */
export function toCommunityMailRecipient(uid, data = {}) {
  if (data.receiveCommunityEmails !== true || data.status === "pendingDeletion") return null;
  if (typeof data.email !== "string" || data.email.trim() === "") return null;

  return {
    uid,
    displayName: typeof data.displayName === "string" ? data.displayName : "",
    email: data.email.trim(),
    correspondenceLanguage:
      data.correspondenceLanguage === "en" || data.correspondenceLanguage === "de"
        ? data.correspondenceLanguage
        : DEFAULT_CORRESPONDENCE_LANGUAGE,
  };
}