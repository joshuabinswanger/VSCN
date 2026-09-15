/** Fail before rendering when a release cannot load data or authenticate users. */
export function requireBuildEnvironment(env: Record<string, unknown>): void {
  const required = [
    "PUBLIC_FIREBASE_PROJECT_ID", "PUBLIC_FIREBASE_API_KEY",
    "PUBLIC_FIREBASE_AUTH_DOMAIN", "PUBLIC_FIREBASE_STORAGE_BUCKET", "PUBLIC_FIREBASE_APP_ID",
    "PUBLIC_TURNSTILE_SITE_KEY",
  ];
  const missing = required.filter(key => typeof env[key] !== "string" || !env[key].trim());
  if (!env.MEMBER_DIRECTORY_SNAPSHOT && !env.FIREBASE_SERVICE_ACCOUNT) missing.push("FIREBASE_SERVICE_ACCOUNT or MEMBER_DIRECTORY_SNAPSHOT");
  if (missing.length) throw new Error(`Missing build configuration: ${missing.join(", ")}`);
}
