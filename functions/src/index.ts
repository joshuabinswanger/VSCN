import { setGlobalOptions } from "firebase-functions/v2";
import { backendLabels } from "./releaseStamp";
setGlobalOptions({ labels: backendLabels });
// The deployable surface. One line per exported function; the code lives in
// the module named for its concern.
export { requestRebuild } from "./rebuild";
export { flushMemberRebuilds, onImageWritten } from "./rebuildQueue";
export { authorizeImageUpload, completeImageUpload } from "./uploads";
export { resolveEmbed, restoreAutoPoster } from "./embeds";
export { mintAppCheckToken } from "./appCheck";
export { requestAccountDeletion, cancelAccountDeletion, syncEmail } from "./accounts";
export { purgeExpiredAccounts, sweepImages, reconcileEmails } from "./maintenance";
export { onAuthUserCreated, onAuthUserDeleted } from "./authTriggers";
export { onImageWentLive, sendAdminDigest } from "./adminDigest";
export { adminRetryNotice } from "./adminDigest";
export { onPublicProfileWritten } from "./slugs";
export {
  adminDeleteImage,
  adminLookupMember,
  adminListActions,
  adminListMembers,
  adminListQueues,
  adminPurgeAccount,
  adminRestoreAccount,
  adminSetMemberEmail,
  adminSetProfileActive,
} from "./adminOps";

export { adminListRatingQueue, adminRateImage, adminSetImageHidden } from "./moderation";

export { acknowledgeSitePublication, getPublicationStatus } from "./publication";
