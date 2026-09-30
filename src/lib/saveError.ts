/**
 * What the Save footer says when the chain throws (2026-09-29).
 *
 * Two kinds of error reach it. Our own — a project or a work record refused,
 * a validation sentence — arrive as plain Errors whose message was written
 * for the member, so it is shown as is. The SDK's arrive as FirebaseErrors
 * carrying a `code`, and their messages ("Missing or insufficient
 * permissions.") name neither the field nor the remedy, so the code is
 * translated into a sentence instead.
 */
export type SaveErrorKind = "refused" | "network" | "session" | "unknown";

export function saveErrorKind(error: unknown): SaveErrorKind {
  const code =
    typeof error === "object" && error !== null ? String(Reflect.get(error, "code") ?? "") : "";
  switch (code.replace(/^functions\//, "")) {
    case "permission-denied":
    case "invalid-argument":
    case "failed-precondition":
      return "refused";
    case "unavailable":
    case "deadline-exceeded":
    case "aborted":
    case "storage/retry-limit-exceeded":
    case "storage/unknown":
    case "auth/network-request-failed":
      return "network";
    case "unauthenticated":
    case "storage/unauthenticated":
    case "auth/user-token-expired":
    case "auth/requires-recent-login":
      return "session";
    default:
      return "unknown";
  }
}

/** True for an error the SDK raised, as opposed to one this codebase wrote for the member. */
function isSdkError(error: unknown): boolean {
  return typeof error === "object" && error !== null && typeof Reflect.get(error, "code") === "string";
}

export function saveErrorMessage(error: unknown, s: Record<string, string>): string {
  if (!isSdkError(error)) {
    return error instanceof Error && error.message ? error.message : s["profile.save.error"];
  }
  switch (saveErrorKind(error)) {
    case "refused":
      return s["profile.save.error.refused"];
    case "network":
      return s["profile.save.error.network"];
    case "session":
      return s["profile.save.error.session"];
    default:
      return s["profile.save.error"];
  }
}
