/** Days between a deletion request and the purge. Spec §2. */
export const GRACE_DAYS = 30;
/** An `uploading` image record older than this has lost its tab; the sweeper takes it. */
export const STALE_UPLOAD_HOURS = 6;
/** How fresh `auth_time` must be for a destructive callable. */
export const REAUTH_WINDOW_SECONDS = 300;
