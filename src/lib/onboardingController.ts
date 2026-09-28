import { auth, isSecurityCheckBlocked, warmUpAppCheck } from "./firebase.ts";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  type User,
} from "firebase/auth";
import { returnTo } from "./authEmail.ts";
import { hasVerifiedClaim } from "./auth.ts";
import { friendlyError, isCredentialError, errorParts, SECURITY_CHECK_BLOCKED } from "./authErrors.ts";
import { validateAvatar, resizeAvatar } from "./validation.ts";
import {
  createUser,
  getUser,
  updateUser,
  updateUserProfile,
  publishCurrentUserProfile,
  upsertOnboardingRequest,
  setProfileActive,
  isMemberType,
  MEMBER_TYPES,
} from "./firestore.ts";
import { memberTypeFieldCopy } from "./memberType.ts";
// The one parse of `socialMedia` in the codebase — shared with the profile
// editor and with every renderer, so a link typed here and the same link
// typed there cannot come out as different entries.
import {
  splitSocial,
  joinSocial,
  profileBio,
  profileRole,
  MAX_SOCIAL_LINKS,
  MAX_SOCIAL_MEDIA,
} from "./links.ts";
import { handleProfileUpdate, triggerRebuild } from "./profile.ts";
import { bindPreviewLightbox, renderCardPreview } from "./profilePreview.ts";
import { lightboxStringsFrom } from "./lightbox.ts";
import "photoswipe/style.css";
// Immediately after the package sheet: the chrome that replaces it.
import "../styles/lightbox.css";
import { markImageForDeletion } from "./images.ts";
import { syncEmail } from "./account.ts";
// The one gallery upload path in the codebase, the same four calls the
// profile editor composes: validate → compress to WebP → upload to Storage
// → write the array to Firestore. Nothing here re-implements any of it.
import {
  MAX_GALLERY_IMAGES,
  MAX_GALLERY_CAPTION,
  MAX_GALLERY_DESCRIPTION,
  galleryLimit,
  validateGalleryFile,
  galleryErrorCode,
  compressGalleryImage,
  uploadGalleryImage,
  loadGallery,
  galleryIds,
  // The editor's own record writer, unchanged and uncopied: the cover
  // image's words go onto images/{imageId} through the same call that
  // /profile's Save makes for all eight.
  saveGalleryRecords,
  type GalleryItem,
} from "./gallery.ts";
import { ui } from "../i18n/translations.ts";

const STORAGE_KEY = "vscn:onboarding:state";

/**
 * The bridge (2) is an interstitial, not a question — it asks nothing and is
 * deliberately absent from `realSteps` so it cannot inflate the count. The
 * gallery (5) IS a question, optional in the same way tags (3) and bio (4)
 * already are, so it is counted like them.
 */
const STEP_GALLERY = 5;
// The closing pair (2026-09-08). Verification is a step only for an account
// that still needs it — see setStep, which drops it from the count for a
// verified one — and visibility is the last question for everyone.
const STEP_VERIFY = 6;
const STEP_VISIBILITY = 7;
const STEP_DONE = 8;

let unsubscribeAuth: (() => void) | null = null;
let prevNavLangHandler: ((e: Event) => void) | null = null;
let prevPageHideHandler: ((e: Event) => void) | null = null;

document.addEventListener("astro:page-load", () => {
  const wrap = document.getElementById("onboarding-wrap") as HTMLElement | null;
  if (!wrap) return;

  // Start the App Check attestation while the member fills in the first
  // step, so the sign-up click does not spend Auth's 30 s clock on a slow
  // mobile Turnstile challenge (see firebase.ts).
  warmUpAppCheck();

  const lang = (wrap.dataset.lang ?? "en") as keyof typeof ui;
  const s = ui[lang] ?? ui.en;
  const prefix = lang === "de" ? "/de" : "";
  // EVERYTHING THE DIRECTORY CARD SAYS THAT ITS MARKUP CANNOT CARRY. The
  // real card resolves these with useTranslations() at build time; the Done
  // step's card is filled in the browser, so they arrive as values. Most are
  // the CAROUSEL's — the preview renders the card's own paging element as of
  // 2026-09-02, and someone finishing onboarding with three uploads gets a
  // card that pages, so it needs the names that make paging usable. Same set
  // ProfileForm assembles.
  const cardPreviewLabels = {
    defaultName: s["profile.preview.defaultName"],
    // The typographic face's fallback when a member has no tags.
    memberTypeLabels: Object.fromEntries(
      MEMBER_TYPES.map((type) => [type, s[`profile.memberType.${type}`]])
    ),
    carousel: s["community.card.carousel"],
    image: s["community.card.image"],
    gallery: s["community.card.gallery"],
    imagePosition: s["community.card.imagePosition"],
    prev: s["community.card.prev"],
    next: s["community.card.next"],
    workAlt: s["member.workAlt"],
  };

  // The Done step's card opens the site's lightbox, as the card it previews
  // does on /community — whole gallery, starting on the slide showing.
  const unbindPreviewLightbox = bindPreviewLightbox(
    { card: document.querySelector<HTMLElement>("[data-ccpv-root]") },
    lightboxStringsFrom(s),
  );
  document.addEventListener("astro:before-swap", unbindPreviewLightbox, { once: true });

  const loadingEl = document.getElementById("ob-loading");
  const errorEl = document.getElementById("ob-error")!;

  let currentStep = 0;
  // What the auth guard learned about the account, read by setStep (which
  // steps there are) and by the closing steps (what may be written). The
  // record's flag, for showing; the token's claim is settled separately, by
  // hasVerifiedClaim, before anything writes on it.
  let emailVerified = false;

  // ── Helpers ───────────────────────────────────────────────────
  function setStep(n: number) {
    currentStep = n;
    document.querySelectorAll<HTMLElement>(".onboarding-step").forEach((el) => {
      el.style.display = el.dataset.step === String(n) ? "" : "none";
    });
    const progressEl = document.getElementById("ob-progress");
    const progressText = document.getElementById("ob-progress-text");
    const progressFill = document.getElementById("ob-progress-fill");
    // A verified account is never shown the verify step, so it is not
    // counted for one — otherwise the bar would promise a screen that never
    // comes and end at six of seven.
    const realSteps = [0, 1, 3, 4, STEP_GALLERY, ...(emailVerified ? [] : [STEP_VERIFY]), STEP_VISIBILITY];
    const idx = realSteps.indexOf(n);
    const hideProgress = n === -1 || n === 2 || n === STEP_DONE;
    if (progressEl) progressEl.style.display = hideProgress ? "none" : "";
    if (progressText && idx >= 0) {
      progressText.textContent = s["onboarding.progress"]
        .replace("{n}", String(idx + 1))
        .replace("{total}", String(realSteps.length));
    }
    if (progressFill && idx >= 0) {
      progressFill.style.width = `${((idx + 1) / realSteps.length) * 100}%`;
    }
    errorEl.style.display = "none";
  }

  function setError(msg: string) {
    errorEl.textContent = msg;
    errorEl.style.display = msg ? "block" : "none";
  }

  function setBtnState(id: string, loading: boolean, idleText: string) {
    const btn = document.getElementById(id) as HTMLButtonElement | null;
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? s["onboarding.saving"] : idleText;
  }

  async function finishToPreview(opts: {
    bio?: string;
    avatarObjectUrl?: string | null;
    photoURL?: string;
  }) {
    const user = auth.currentUser;
    if (!user) return;

    // Unsubscribe the auth guard first so a stray onAuthStateChanged
    // re-fire (e.g. after updateProfile/getIdToken) can't redirect us
    // to /community once onboardingComplete is true.
    unsubscribeAuth?.();
    unsubscribeAuth = null;

    clearTransientState();

    try {
      // Republish a complete publicProfile from the private user doc.
      // Heals any wipe that may have happened from earlier partial saves.
      await publishCurrentUserProfile(user.uid);
    } catch {
      // non-critical
    }

    // FINISHING ONBOARDING WRITES THE VISIBILITY THE MEMBER CHOSE on the
    // step before this one (2026-09-08) — until then the flag was set
    // silently, at the bridge and again here (2026-09-04, Josh: "it should
    // become active when verifying and when going through the sign up flow.
    // it should be an active task to untick it"; the default is still
    // ticked, the act is now visible). After publishCurrentUserProfile on
    // purpose: that write puts `active: false` on an unverified account
    // and would otherwise undo this one.
    //
    // Unverified accounts write nothing — the draft is already `false`,
    // canPublish() in firestore.rules would refuse `true`, and verification
    // is what publishes them, through the emailed link. The Done step then
    // says which of the three things is true, from what actually happened
    // rather than from what was asked for: a refused write is a hidden
    // profile, whatever the box said.
    const wantsActive = (document.getElementById("ob-active") as HTMLInputElement | null)?.checked ?? true;
    let listed = false;
    if (emailVerified) {
      try {
        await setProfileActive(user.uid, wantsActive);
        listed = wantsActive;
      } catch {
        listed = false;
      }
    }
    const disclaimer = document.getElementById("ob-done-disclaimer");
    if (disclaimer) {
      disclaimer.textContent = !emailVerified
        ? s["onboarding.done.disclaimer.unverified"]
        : listed
          ? s["onboarding.done.disclaimer"]
          : s["onboarding.done.disclaimer.hidden"];
    }

    try {
      await updateUser(user.uid, { onboardingComplete: true });
    } catch {
      // non-critical
    }

    populatePreviewCard({
      displayName: getInputValue("ob-name").trim(),
      memberType: memberTypeSelector?.value ?? "",
      // Picked for the wizard's own locale, as the built pages will pick it.
      role: profileRole({ role: getInputValue("ob-role"), roleDe: getInputValue("ob-role-de") }, lang === "de" ? "de" : "en"),
      portfolio: getInputValue("ob-portfolio").trim(),
      socialMedia: socialStored(),
      bio: profileBio({ bio: opts.bio ?? "", bioDe: getInputValue("ob-bio-de") }, lang === "de" ? "de" : "en"),
      photoURL: opts.photoURL ?? user.photoURL ?? "",
      avatarObjectUrl: opts.avatarObjectUrl ?? null,
    });
    setStep(STEP_DONE);
    await triggerRebuild();
  }

  function getInputValue(id: string): string {
    const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
    return el?.value ?? "";
  }

  function saveTransientState() {
    if (currentStep === STEP_DONE) return;
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          step: currentStep,
          memberType: memberTypeSelector?.value ?? "",
          name: getInputValue("ob-name"),
          role: getInputValue("ob-role"),
          roleDe: getInputValue("ob-role-de"),
          portfolio: getInputValue("ob-portfolio"),
          social: socialStored(),
          phone: getInputValue("ob-phone"),
          bio: getInputValue("ob-bio"),
          bioDe: getInputValue("ob-bio-de"),
          platformRequest: getInputValue("ob-platform-request"),
          openTo: openToSelector?.value ?? [],
          wantsToContribute: (document.getElementById("ob-wants-to-contribute") as HTMLInputElement | null)?.checked ?? false,
          preferredLanguage: (document.getElementById("ob-preferred-language") as HTMLSelectElement | null)?.value === "en" ? "en" : "de",
          receiveCommunityEmails: (document.getElementById("ob-receive-community-emails") as HTMLInputElement | null)?.checked ?? false,
          tags: tagSelector?.value ?? [],
          tagInput: tagSelector?.inputValue ?? "",
        })
      );
    } catch {
      // sessionStorage unavailable — ignore
    }
  }

  function clearTransientState() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  function readTransientState(): {
    step?: number;
    memberType?: string;
    name?: string;
    role?: string;
    roleDe?: string;
    portfolio?: string;
    social?: string;
    phone?: string;
    bio?: string;
    bioDe?: string;
    platformRequest?: string;
    openTo?: string[];
    wantsToContribute?: boolean;
    preferredLanguage?: "de" | "en";
    receiveCommunityEmails?: boolean;
    tags?: string[];
    tagInput?: string;
  } | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  const openToSelector = document.querySelector<
    HTMLElement & {
      value: string[];
    }
  >("open-to-selector");

  // ── Member type (step 0) ───────────────────────────────────────
  const memberTypeSelector = document.querySelector<
    HTMLElement & {
      value: string;
    }
  >("member-type-selector");

  /** Scientists and research groups get lab-facing field wording. */
  function syncMemberTypeCopy() {
    const copy = memberTypeFieldCopy(memberTypeSelector?.value ?? "", (key) => s[key] ?? key);
    const nameEl = document.getElementById("ob-name") as HTMLInputElement | null;
    const roleEl = document.getElementById("ob-role") as HTMLInputElement | null;
    const portfolioEl = document.getElementById("ob-portfolio") as HTMLInputElement | null;
    const portfolioLabel = document.getElementById("ob-portfolio-label");
    if (nameEl) nameEl.placeholder = copy.namePlaceholder;
    if (roleEl) roleEl.placeholder = copy.rolePlaceholder;
    if (portfolioEl) portfolioEl.placeholder = copy.portfolioPlaceholder;
    if (portfolioLabel) portfolioLabel.textContent = copy.portfolioLabel;
  }

  memberTypeSelector?.addEventListener("member-type-change", syncMemberTypeCopy);

  // ── Social links (step 0) ──────────────────────────────────────
  // One row per link on screen; ONE comma-joined string in Firestore, which
  // is the shape every reader of the field already understands — the rules,
  // the build-time directory snapshot, and every profile stored before the
  // rows existed. splitSocial()/joinSocial() in links.ts are the whole
  // translation and are SHARED with the profile editor, so the two cannot
  // disagree about what a row is or what order they store in.
  const socialEditor = document.getElementById("ob-social-editor");
  const socialAdd = document.getElementById("ob-social-add") as HTMLButtonElement | null;
  const socialStatus = document.getElementById("ob-social-status");
  const socialLabel = document.getElementById("ob-social-label");
  const socialRowTpl = document.querySelector<HTMLTemplateElement>('[data-ob-social-tpl="row"]');
  let socialValues: string[] = [""];

  function setSocialStatus(text: string) {
    if (!socialStatus) return;
    socialStatus.textContent = text;
    socialStatus.style.display = text ? "block" : "none";
  }

  /** The single stored value the rows add up to. */
  function socialStored(): string {
    return joinSocial(socialValues);
  }

  function refreshSocialStatus() {
    if (socialAdd) socialAdd.disabled = socialValues.length >= MAX_SOCIAL_LINKS;
    // Length, not count, is the real limit — firestore.rules caps the joined
    // field at MAX_SOCIAL_MEDIA and rejects the WHOLE write over it, so the
    // member has to hear about it here rather than as a bare permission
    // error on the way out of the step.
    if (socialStored().length > MAX_SOCIAL_MEDIA) {
      setSocialStatus(s["profile.social.tooLong"]);
    } else if (socialValues.length >= MAX_SOCIAL_LINKS) {
      setSocialStatus(s["profile.social.full"]);
    } else {
      setSocialStatus("");
    }
  }

  /**
   * Full rebuild of the rows. Called on load, add and remove only — never
   * while typing, which would take the caret with it. Keystrokes write
   * straight into socialValues[index].
   */
  function renderSocial() {
    if (!socialEditor || !socialRowTpl) return;
    socialEditor.replaceChildren(
      ...socialValues
        .map((value, index) => {
          const row = socialRowTpl.content.firstElementChild?.cloneNode(true);
          if (!(row instanceof HTMLElement)) return null;
          const input = row.querySelector<HTMLInputElement>("[data-social-input]");
          const remove = row.querySelector<HTMLButtonElement>("[data-social-remove]");
          if (!input || !remove) return null;

          input.value = value;
          input.placeholder = s["profile.ph.social"];
          // Rows share one field label, so the position is what tells them
          // apart to anyone who cannot see the stack.
          input.setAttribute(
            "aria-label",
            `${socialLabel?.textContent ?? ""} ${index + 1}`.trim()
          );
          input.addEventListener("input", () => {
            socialValues[index] = input.value;
            refreshSocialStatus();
          });

          remove.setAttribute("aria-label", s["profile.social.remove"]);
          remove.addEventListener("click", () => removeSocialRow(index));
          return row;
        })
        .filter((n): n is HTMLElement => n !== null)
    );
    refreshSocialStatus();
  }

  function setSocialValues(values: string[]) {
    // Always at least one row: an empty stack with only a button reads as a
    // missing field rather than an empty one, and this is a sign-up form
    // where a field that looks absent is a question nobody answers. The
    // blank row costs nothing — joinSocial() drops it.
    socialValues = values.length > 0 ? values : [""];
    renderSocial();
  }

  function addSocialRow() {
    if (socialValues.length >= MAX_SOCIAL_LINKS) {
      setSocialStatus(s["profile.social.full"]);
      return;
    }
    socialValues.push("");
    renderSocial();
    socialEditor
      ?.querySelector<HTMLInputElement>(".social-row:last-of-type [data-social-input]")
      ?.focus();
  }

  /** Removing the only row empties it rather than leaving no field at all. */
  function removeSocialRow(index: number) {
    if (socialValues.length <= 1) socialValues = [""];
    else socialValues.splice(index, 1);
    renderSocial();
  }

  socialAdd?.addEventListener("click", addSocialRow);
  // The one empty row the field opens with. Anything stored or drafted
  // replaces it when the step is filled in below.
  setSocialValues([]);

  // ── Tags (delegated to the <tag-selector> custom element) ─────
  // SCOPED TO ITS OWN FIELD. There are two selectors in this form since
  // 2026-09-08 — the member's tags here and the cover image's on the
  // gallery step — and a bare `tag-selector` query means "the first one in
  // the document", which is this one only by the order the steps happen to
  // be written in. The editor's per-image selectors are scoped the same way.
  const tagSelector = document.querySelector<
    HTMLElement & {
      value: string[];
      inputValue: string;
    }
  >("#ob-member-tags-field tag-selector");

  // ── Avatar (step 4) ────────────────────────────────────────────
  const avatarInput = document.getElementById("ob-avatar-input") as HTMLInputElement;
  const avatarImg = document.getElementById("ob-avatar-img") as HTMLImageElement;
  const avatarWrap = document.getElementById("ob-avatar-wrap") as HTMLElement;
  const uploadStatus = document.getElementById("ob-upload-status") as HTMLElement;
  let resizedAvatarBlob: Blob | null = null;
  let avatarColor = "";
  // The record behind the avatar currently stored, exactly as ProfileForm
  // tracks it. Without it, replacing the avatar twice inside one onboarding
  // left the first record `live` forever — an image nothing references and
  // no sweeper takes.
  let currentPhotoImageId = "";

  avatarInput?.addEventListener("change", async () => {
    const file = avatarInput.files?.[0];
    if (!file) return;
    const validation = validateAvatar(file);
    if (!validation.ok) {
      uploadStatus.textContent = validation.error!;
      uploadStatus.style.display = "block";
      return;
    }
    uploadStatus.textContent = s["profile.upload.processing"];
    uploadStatus.style.display = "block";
    try {
      ({ blob: resizedAvatarBlob, color: avatarColor } = await resizeAvatar(file));
      const url = URL.createObjectURL(resizedAvatarBlob);
      avatarImg.src = url;
      avatarWrap.classList.add("has-image");
      uploadStatus.textContent = `${s["profile.upload.selected"]}${file.name}`;
    } catch {
      uploadStatus.textContent = s["profile.upload.error"];
      resizedAvatarBlob = null;
    }
  });

  // ── Gallery (step 5) ───────────────────────────────────────────
  // Uploads persist the moment they land, exactly as the profile editor
  // does, because they own files in Storage and the Firestore array is what
  // says which of those files still belong to the member. The consequence
  // that matters here: Finish never has an upload left to do, so a failed
  // upload can never hold the member short of the Done step.
  let gallery: GalleryItem[] = [];
  let uploadsInFlight = 0;

  const galleryInput = document.getElementById("ob-gallery-input") as HTMLInputElement | null;
  const galleryGrid = document.getElementById("ob-gallery-grid");
  const galleryStatus = document.getElementById("ob-gallery-status");

  function setGalleryStatus(text: string) {
    if (!galleryStatus) return;
    galleryStatus.textContent = text;
    galleryStatus.style.display = text ? "block" : "none";
  }

  /** Finish and Skip stay honest while bytes are still moving. */
  function setGalleryBusy(busy: boolean) {
    const finish = document.getElementById("ob-next-5") as HTMLButtonElement | null;
    const skip = document.getElementById("ob-skip-5") as HTMLButtonElement | null;
    if (finish) finish.disabled = busy;
    if (skip) skip.disabled = busy;
  }

  /**
   * Verified until the auth guard says otherwise — the same default the
   * banner takes, so nothing flashes the pessimistic copy on the way in.
   */
  let galleryVerified = true;

  /**
   * The limit line says what is true NOW, and the reassurance leaves once it
   * has been answered.
   *
   * Three states rather than two, because "one image for now" and "that was
   * your one image" are different sentences to be reading: the first is a
   * budget, the second is a reason the Add button just disappeared.
   */
  function updateGalleryNotes() {
    const limit = document.getElementById("ob-gallery-limit");
    const later = document.getElementById("ob-gallery-later");
    if (limit) {
      limit.textContent = galleryVerified
        ? s["onboarding.step5.note"]
        : gallery.length > 0
          ? s["onboarding.step5.noteUnverifiedFull"]
          : s["onboarding.step5.noteUnverified"];
    }
    // "Nothing to show yet is a normal answer" is an answer to a question
    // the member has already answered once an image is on screen.
    if (later) later.hidden = gallery.length > 0;
  }

  function renderGallery() {
    if (!galleryGrid) return;
    updateGalleryNotes();
    galleryGrid.replaceChildren(
      ...gallery.map((item, index) => {
        const wrap = document.createElement("div");
        wrap.className = "ob-gallery-thumb";
        const img = document.createElement("img");
        img.src = item.url;
        img.alt = "";
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "ob-gallery-thumb-remove";
        remove.textContent = "×";
        remove.setAttribute("aria-label", s["profile.gallery.remove"]);
        remove.addEventListener("click", () => removeGalleryImage(index));
        wrap.append(img, remove);
        return wrap;
      })
    );
    const input = document.getElementById("ob-gallery-input") as HTMLInputElement | null;
    const label = input?.closest("label") as HTMLElement | null;
    // Onboarding hides the control at the ceiling rather than explaining it;
    // for an unverified member that ceiling is one image, and the status line
    // above already carries the reason from the last attempt.
    if (label) label.style.display = gallery.length >= galleryLimit(auth.currentUser) ? "none" : "";
    syncCoverFields();
  }

  // ── The cover image's words (step 5) ──────────────────────────
  const coverFields = document.getElementById("ob-cover-fields");
  const coverCaption = document.getElementById("ob-img-caption") as HTMLInputElement | null;
  const coverDescription = document.getElementById("ob-img-description") as HTMLTextAreaElement | null;
  const coverTags = document.querySelector<HTMLElement & { value: string[] }>(
    "#ob-image-tags-field tag-selector"
  );
  // The rulesets refuse a longer value outright (validImage in
  // firestore.rules), so the ceiling belongs on the control, where it costs
  // the member a keystroke that does nothing instead of a refused save they
  // cannot read. Same numbers, same reason, as the editor's rows.
  if (coverCaption) coverCaption.maxLength = MAX_GALLERY_CAPTION;
  if (coverDescription) coverDescription.maxLength = MAX_GALLERY_DESCRIPTION;

  /**
   * The block mirrors gallery[0] — shown once there is an image to name,
   * emptied and hidden when there is not.
   *
   * The activeElement guard is not decoration: an upload settles
   * asynchronously and calls renderGallery when it does, so a member typing
   * a caption while a second image finishes would otherwise have the field
   * they are in overwritten from the record mid-sentence.
   */
  function syncCoverFields() {
    const item = gallery[0];
    if (coverFields) coverFields.hidden = !item;
    if (!item) {
      if (coverCaption) coverCaption.value = "";
      if (coverDescription) coverDescription.value = "";
      if (coverTags) coverTags.value = [];
      return;
    }
    if (coverCaption && document.activeElement !== coverCaption) {
      coverCaption.value = item.caption ?? "";
    }
    if (coverDescription && document.activeElement !== coverDescription) {
      coverDescription.value = item.description ?? "";
    }
    if (coverTags) coverTags.value = item.tags ?? [];
  }

  /**
   * WRITTEN ON BLUR, not at Finish. This step already persists every upload
   * the moment it lands (see the note on `gallery` above), and the words
   * follow the same rule: nothing the member typed here is waiting on a
   * later button, and Finish stays a step that cannot fail on the gallery's
   * behalf. `change` rather than `input` — one write per field left, not one
   * per keystroke.
   *
   * A failure is REPORTED. saveGalleryRecords returns its failures instead
   * of throwing (the editor's Save turns them into a sentence naming each
   * image); here there is only ever one record in flight, so the status line
   * the uploader already owns is where it goes.
   */
  async function saveCoverWords() {
    const item = gallery[0];
    if (!item) return;
    const failures = await saveGalleryRecords([item]);
    if (failures.length > 0) {
      console.warn(`[onboarding] record ${failures[0].imageId} not saved:`, failures[0].error);
      setGalleryStatus(s["profile.gallery.error"]);
    } else {
      setGalleryStatus("");
    }
  }

  coverCaption?.addEventListener("change", () => {
    const item = gallery[0];
    if (!item) return;
    item.caption = coverCaption.value.trim();
    void saveCoverWords();
  });

  coverDescription?.addEventListener("change", () => {
    const item = gallery[0];
    if (!item) return;
    item.description = coverDescription.value.trim();
    void saveCoverWords();
  });

  // <tag-selector> dispatches a bubbling `change` of its own, so this is the
  // same event the two text fields use. Absent rather than empty when
  // nothing is chosen, exactly as the editor does it — updateImageText
  // deletes the key on the record either way, and keeping the in-memory item
  // in that shape is what makes the two paths comparable.
  coverTags?.addEventListener("change", () => {
    const item = gallery[0];
    if (!item) return;
    const tags = coverTags.value;
    if (tags.length) item.tags = tags;
    else delete item.tags;
    void saveCoverWords();
  });

  async function persistGallery() {
    const user = auth.currentUser;
    if (!user) return;
    // The ids are the array; since 2026-09-07 the words live on the records.
    await updateUserProfile(user.uid, { gallery: galleryIds(gallery), updatedAt: new Date() });
  }

  async function removeGalleryImage(index: number) {
    const [removed] = gallery.splice(index, 1);
    renderGallery();
    try {
      await persistGallery();
      if (removed) await markImageForDeletion(removed.imageId);
      setGalleryStatus("");
    } catch {
      setGalleryStatus(s["profile.gallery.error"]);
    }
  }

  galleryInput?.addEventListener("change", async () => {
    const user = auth.currentUser;
    if (!user) return;
    const files = Array.from(galleryInput.files ?? []);
    galleryInput.value = "";
    if (files.length === 0) return;

    uploadsInFlight += 1;
    setGalleryBusy(true);
    let uploaded = false;
    let failed = false;
    try {
      for (const file of files) {
        const limit = galleryLimit(user);
        if (gallery.length >= limit) {
          setGalleryStatus(
            limit < MAX_GALLERY_IMAGES ? s["profile.gallery.verifyForMore"] : s["profile.gallery.full"],
          );
          break;
        }
        // A code, not a sentence: validateGalleryFile knows what is wrong
        // and this side knows which language the member reads in.
        const rejected = validateGalleryFile(file);
        if (rejected) {
          setGalleryStatus(s[`profile.gallery.err.${rejected}`]);
          failed = true;
          continue;
        }
        try {
          setGalleryStatus(s["profile.upload.processing"]);
          const compressed = await compressGalleryImage(file);
          const item = await uploadGalleryImage(user.uid, compressed, {
            onProgress: (pct) =>
              setGalleryStatus(`${s["profile.upload.uploading"]} ${pct}%`),
          });
          // One image failing is one image failing: the loop keeps going and
          // everything already uploaded stays.
          gallery.push(item);
          uploaded = true;
          renderGallery();
        } catch (err) {
          // Named, because the causes call for different actions: an expired
          // sign-in and a file that will never fit are both permanent, and
          // "please try again" was wrong advice for both.
          setGalleryStatus(s[`profile.gallery.err.${galleryErrorCode(err)}`]);
          failed = true;
        }
      }

      if (uploaded) {
        try {
          await persistGallery();
          if (!failed) setGalleryStatus(s["profile.upload.complete"]);
        } catch {
          setGalleryStatus(s["profile.gallery.error"]);
        }
      }
    } finally {
      uploadsInFlight -= 1;
      if (uploadsInFlight === 0) setGalleryBusy(false);
    }
  });

  // ── Navigation buttons ─────────────────────────────────────────
  document.getElementById("ob-next-0")?.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;
    setBtnState("ob-next-0", true, s["onboarding.nav.next"]);
    try {
      const nameVal = getInputValue("ob-name").trim();
      const roleVal = getInputValue("ob-role").trim();
      const roleDeVal = getInputValue("ob-role-de").trim();
      const portfolioVal = getInputValue("ob-portfolio").trim();
      const socialVal = socialStored();
      const phoneVal = getInputValue("ob-phone").trim();
      const memberTypeVal = memberTypeSelector?.value ?? "";

      await handleProfileUpdate(user, {
        displayName: nameVal,
        // Omit rather than write "" — the field is absent until chosen.
        ...(isMemberType(memberTypeVal) ? { memberType: memberTypeVal } : {}),
        role: roleVal,
        roleDe: roleDeVal,
        portfolio: portfolioVal,
        socialMedia: socialVal,
        phone: phoneVal,
      });
    } finally {
      setBtnState("ob-next-0", false, s["onboarding.nav.next"]);
      setStep(1);
    }
  });

  document.getElementById("ob-next-1")?.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;
    setBtnState("ob-next-1", true, s["onboarding.nav.next"]);
    setError("");
    try {
      const wantsToContributeEl = document.getElementById("ob-wants-to-contribute") as HTMLInputElement | null;
      await updateUser(user.uid, {
        openTo: openToSelector?.value ?? [],
        wantsToContribute: wantsToContributeEl?.checked ?? false,
        preferredLanguage: (document.getElementById("ob-preferred-language") as HTMLSelectElement | null)?.value === "en" ? "en" : "de",
        receiveCommunityEmails: (document.getElementById("ob-receive-community-emails") as HTMLInputElement | null)?.checked ?? false,
      });
      const platformRequest = getInputValue("ob-platform-request").trim();
      if (platformRequest) {
        await upsertOnboardingRequest(user.uid, {
          message: platformRequest,
          lang: lang === "de" ? "de" : "en",
          displayName: getInputValue("ob-name").trim() || user.displayName || undefined,
        }).catch((err) => {
          console.warn("[onboarding] Request save skipped:", err);
        });
      }
      setStep(2);
    } catch {
      setError(s["onboarding.error.save"]);
    } finally {
      setBtnState("ob-next-1", false, s["onboarding.nav.next"]);
    }
  });

  // The bridge no longer publishes anyone (2026-09-08). It used to write
  // `active: true` on both buttons, so a member was in the directory from
  // here on whatever they did next; now the visibility step asks, and the
  // early exit goes through it like every other route out.
  document.getElementById("ob-continue-2")?.addEventListener("click", () => setStep(3));
  document.getElementById("ob-skip-2")?.addEventListener("click", toClosing);

  document.getElementById("ob-next-3")?.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;
    setBtnState("ob-next-3", true, s["onboarding.nav.next"]);
    try {
      const tagsValue = tagSelector?.value ?? [];
      await updateUserProfile(user.uid, {
        tags: tagsValue,
        updatedAt: new Date(),
      }).catch(() => {});
    } finally {
      setBtnState("ob-next-3", false, s["onboarding.nav.next"]);
      setStep(4);
    }
  });

  // Skip means "not this one", not "not the rest of them" — otherwise
  // skipping tags would silently swallow the bio and the gallery too, and
  // the step that fills the directory with images would be the one almost
  // nobody is ever shown. The bridge (2) remains the single early exit.
  document.getElementById("ob-skip-3")?.addEventListener("click", () => setStep(4));

  function populatePreviewCard(opts: {
    displayName: string;
    memberType: string;
    role: string;
    portfolio: string;
    socialMedia: string;
    bio: string;
    photoURL: string;
    avatarObjectUrl: string | null;
  }) {
    const root = document.querySelector<HTMLElement>("[data-ccpv-root]");
    if (!root) return;
    // Which face the card gets is decided by the gallery step: an image
    // card when something was uploaded, otherwise the typographic card —
    // the framed rectangle of their tags, falling back to member type, then
    // role. Either way it is what /community will render. The avatar fields
    // still arrive in opts but the directory card does not show an avatar;
    // the gallery is the card's only image source.
    renderCardPreview(
      root,
      {
        displayName: opts.displayName,
        role: opts.role,
        memberType: opts.memberType,
        bio: opts.bio,
        affiliation: "",
        location: "",
        languages: [],
        visualNeeds: [],
        tags: tagSelector?.value ?? [],
        openTo: [],
        portfolio: opts.portfolio,
        socialMedia: opts.socialMedia,
        works: gallery.map((g) => ({
          url: g.url,
          width: g.width,
          height: g.height,
          caption: g.caption,
          color: g.color,
          tags: g.tags ?? [],
        })),
      },
      cardPreviewLabels
    );
  }

  // Bio and avatar are saved on the way out of step 4, but the Done card is
  // only painted at the end of step 5, so what they produced has to survive
  // the trip.
  let pendingBio = "";
  let pendingPhotoURL: string | undefined;
  let pendingAvatarObjectUrl: string | null = null;

  document.getElementById("ob-next-4")?.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;
    setBtnState("ob-next-4", true, s["onboarding.nav.next"]);
    setError("");
    try {
      const bioVal = getInputValue("ob-bio").trim();
      const bioDeVal = getInputValue("ob-bio-de").trim();
      let avatarObjectUrl: string | null = null;
      if (resizedAvatarBlob) {
        avatarObjectUrl = URL.createObjectURL(resizedAvatarBlob);
      }

      const { photoURL, photoImageId } = await handleProfileUpdate(
        user,
        {
          bio: bioVal,
          bioDe: bioDeVal,
          resizedAvatarBlob,
          previousPhotoImageId: currentPhotoImageId,
          ...(resizedAvatarBlob && avatarColor ? { photoColor: avatarColor } : {}),
        },
        (pct) => {
          uploadStatus.textContent = `${s["profile.upload.uploading"]} ${pct}%`;
          uploadStatus.style.display = "block";
        }
      );

      if (photoImageId) currentPhotoImageId = photoImageId;
      pendingBio = bioVal;
      pendingPhotoURL = photoURL;
      pendingAvatarObjectUrl = avatarObjectUrl;
      setBtnState("ob-next-4", false, s["onboarding.nav.next"]);
      setStep(STEP_GALLERY);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : s["onboarding.error.save"]);
      setBtnState("ob-next-4", false, s["onboarding.nav.next"]);
    }
  });

  document.getElementById("ob-skip-4")?.addEventListener("click", () => setStep(STEP_GALLERY));

  // Both gallery buttons lead the same way. Whatever the gallery step did or
  // failed to do is already settled in Storage and Firestore by the time
  // either is pressed, so neither can be blocked by it.
  document.getElementById("ob-next-5")?.addEventListener("click", toClosing);
  document.getElementById("ob-skip-5")?.addEventListener("click", toClosing);

  // ── The closing pair: verify, then visibility ─────────────────
  /** Into the closing steps from wherever the questions ended. */
  function toClosing() {
    setStep(emailVerified ? STEP_VISIBILITY : STEP_VERIFY);
  }

  /**
   * The verification step's one job. reload() refreshes the account RECORD;
   * it does not mint a token, and the token is all the rulesets read — so
   * the claim is settled here too, before anything that writes on the
   * strength of it (the visibility step, the gallery cap). Same pairing as
   * VerifyEmailForm and /auth/action.
   */
  async function continueIfVerified(user: User): Promise<boolean> {
    await user.reload();
    if (!user.emailVerified) return false;
    await hasVerifiedClaim(user);
    emailVerified = true;
    galleryVerified = true;
    updateGalleryNotes();
    syncVisibilityStep();
    return true;
  }

  /** The visibility box is only offerable to an account that can be published. */
  function syncVisibilityStep() {
    const box = document.getElementById("ob-active") as HTMLInputElement | null;
    const locked = document.getElementById("ob-visibility-locked");
    if (box) {
      box.disabled = !emailVerified;
      if (!emailVerified) box.checked = false;
      else if (!box.dataset.touched) box.checked = true;
    }
    if (locked) locked.style.display = emailVerified ? "none" : "";
  }
  document.getElementById("ob-active")?.addEventListener("change", (e) => {
    (e.currentTarget as HTMLInputElement).dataset.touched = "1";
  });

  const verifyCheck = document.getElementById("ob-verify-check") as HTMLButtonElement | null;
  const verifyStatus = document.getElementById("ob-verify-status");
  const verifyResend = document.getElementById("ob-verify-resend") as HTMLButtonElement | null;
  const verifyResent = document.getElementById("ob-verify-resent");
  verifyCheck?.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;
    setBtnState("ob-verify-check", true, s["verify.cta"]);
    if (verifyStatus) verifyStatus.style.display = "none";
    try {
      if (await continueIfVerified(user)) {
        setStep(STEP_VISIBILITY);
        return;
      }
      if (verifyStatus) {
        verifyStatus.textContent = s["verify.notVerified"];
        verifyStatus.style.display = "block";
      }
    } catch {
      if (verifyStatus) {
        verifyStatus.textContent = s["verify.error.generic"];
        verifyStatus.style.display = "block";
      }
    } finally {
      setBtnState("ob-verify-check", false, s["verify.cta"]);
    }
  });
  let verifyResendCooldown = false;
  verifyResend?.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user || verifyResendCooldown) return;
    verifyResendCooldown = true;
    verifyResend.disabled = true;
    if (verifyResent) verifyResent.style.display = "none";
    try {
      await sendEmailVerification(user, returnTo(lang, "/onboarding"));
      if (verifyResent) verifyResent.style.display = "block";
    } catch {
      if (verifyStatus) {
        verifyStatus.textContent = s["verify.error.resend"];
        verifyStatus.style.display = "block";
      }
    }
    setTimeout(() => {
      verifyResendCooldown = false;
      verifyResend.disabled = false;
    }, 30000);
  });
  document.getElementById("ob-skip-6")?.addEventListener("click", () => setStep(STEP_VISIBILITY));
  document.getElementById("ob-visibility-verify")?.addEventListener("click", () => setStep(STEP_VERIFY));

  document.getElementById("ob-finish")?.addEventListener("click", async () => {
    setBtnState("ob-finish", true, s["onboarding.nav.finish"]);
    try {
      await finishToPreview({
        bio: pendingBio,
        photoURL: pendingPhotoURL,
        avatarObjectUrl: pendingAvatarObjectUrl,
      });
    } finally {
      setBtnState("ob-finish", false, s["onboarding.nav.finish"]);
    }
  });


  // ── Auth guard ─────────────────────────────────────────────────
  async function onUserAuthenticated(user: User) {
    try {
      // Settle "am I verified" against the TOKEN before anything reads it.
      // This page picks a gallery cap and an image id from verification
      // state, and both are judged by the rulesets against the token, not
      // against the cached account record. The two disagree for up to an
      // hour after the link is clicked. See hasVerifiedClaim.
      await hasVerifiedClaim(user);
      // Known before anything below reads it — the restore block decides a
      // step from it, and setStep counts steps by it.
      emailVerified = user.emailVerified;
      const data = await getUser(user.uid);
      if (data.onboardingComplete) {
        window.location.href = `${prefix}/community`;
        return;
      }

      currentPhotoImageId = data.photoImageId ?? "";

      // Pre-fill existing data
      const nameEl = document.getElementById("ob-name") as HTMLInputElement;
      const roleEl = document.getElementById("ob-role") as HTMLInputElement;
      const portfolioEl = document.getElementById("ob-portfolio") as HTMLInputElement;
      const phoneEl = document.getElementById("ob-phone") as HTMLInputElement;
      const bioEl = document.getElementById("ob-bio") as HTMLTextAreaElement;
      const requestEl = document.getElementById("ob-platform-request") as HTMLTextAreaElement;

      nameEl.value = data.displayName ?? user.displayName ?? "";
      roleEl.value = data.role ?? "";
      const roleDeEl = document.getElementById("ob-role-de") as HTMLInputElement | null;
      if (roleDeEl) roleDeEl.value = data.roleDe ?? "";
      portfolioEl.value = data.portfolio ?? "";
      setSocialValues(splitSocial(data.socialMedia ?? ""));
      phoneEl.value = data.phone ?? "";
      if (bioEl) bioEl.value = data.bio ?? "";
      const bioDeEl = document.getElementById("ob-bio-de") as HTMLTextAreaElement | null;
      if (bioDeEl) bioDeEl.value = data.bioDe ?? "";
      if (requestEl) requestEl.value = "";

      const wantsToContributeEl = document.getElementById("ob-wants-to-contribute") as HTMLInputElement | null;
      if (wantsToContributeEl) wantsToContributeEl.checked = data.wantsToContribute ?? false;
      const preferredLanguageEl = document.getElementById("ob-preferred-language") as HTMLSelectElement | null;
      // Never chosen: keep the locale they signed up in, not a blanket German.
      if (preferredLanguageEl && (data.preferredLanguage === "en" || data.preferredLanguage === "de")) preferredLanguageEl.value = data.preferredLanguage;
      const receiveCommunityEmailsEl = document.getElementById("ob-receive-community-emails") as HTMLInputElement | null;
      if (receiveCommunityEmailsEl) receiveCommunityEmailsEl.checked = data.receiveCommunityEmails === true;

      if (memberTypeSelector) {
        memberTypeSelector.value = data.memberType ?? "";
        syncMemberTypeCopy();
      }

      if (openToSelector && Array.isArray(data.openTo)) {
        openToSelector.value = data.openTo.filter(Boolean);
      }

      const savedTags = Array.isArray(data.tags) ? data.tags.filter(Boolean).slice(0, 7) : [];
      if (tagSelector) tagSelector.value = savedTags;

      // Each image is in Firestore the moment it lands, so re-reading is the
      // whole restore — no transient copy to keep in step, and a language
      // switch mid-gallery keeps the thumbnails.
      //
      // Ids only in the stored array since 2026-09-07 — the thumbnails come
      // from the records, one query, same join the editor uses.
      gallery = await loadGallery(user.uid, data.gallery);
      renderGallery();
    } catch {
      // Permission denied or network error — show form with empty fields.
      // Since 2026-09-07 this also swallows a refused `images` query, which
      // restores an empty gallery rather than the member's thumbnails. Only a
      // RELOAD repairs that: an upload in this state would shorten the stored
      // list, because `persistGallery` writes the in-memory ids over it and
      // the earlier records would be left orphaned, listed by nothing.
    }

    // Restore transient state (e.g. after a language switch)
    const restoreState = readTransientState();
    let restoredStep = 0;
    if (restoreState) {
      const setIfPresent = (id: string, val?: string) => {
        if (val == null) return;
        const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
        if (el) el.value = val;
      };
      setIfPresent("ob-name", restoreState.name);
      setIfPresent("ob-role", restoreState.role);
      setIfPresent("ob-role-de", restoreState.roleDe);
      setIfPresent("ob-portfolio", restoreState.portfolio);
      if (restoreState.social != null) setSocialValues(splitSocial(restoreState.social));
      setIfPresent("ob-phone", restoreState.phone);
      setIfPresent("ob-bio", restoreState.bio);
      setIfPresent("ob-bio-de", restoreState.bioDe);
      setIfPresent("ob-platform-request", restoreState.platformRequest);
      if (memberTypeSelector && restoreState.memberType) {
        memberTypeSelector.value = restoreState.memberType;
        syncMemberTypeCopy();
      }
      if (openToSelector && Array.isArray(restoreState.openTo)) {
        openToSelector.value = restoreState.openTo;
      }
      const wantsToContributeElRestore = document.getElementById("ob-wants-to-contribute") as HTMLInputElement | null;
      if (wantsToContributeElRestore && restoreState.wantsToContribute != null) {
        wantsToContributeElRestore.checked = restoreState.wantsToContribute;
      }
      const preferredLanguageElRestore = document.getElementById("ob-preferred-language") as HTMLSelectElement | null;
      if (preferredLanguageElRestore && restoreState.preferredLanguage) preferredLanguageElRestore.value = restoreState.preferredLanguage;
      const receiveCommunityEmailsElRestore = document.getElementById("ob-receive-community-emails") as HTMLInputElement | null;
      if (receiveCommunityEmailsElRestore && restoreState.receiveCommunityEmails != null) receiveCommunityEmailsElRestore.checked = restoreState.receiveCommunityEmails;
      if (tagSelector && Array.isArray(restoreState.tags)) {
        const current = tagSelector.value;
        const merged = [...current];
        restoreState.tags.forEach((t) => {
          if (!merged.some((s) => s.toLowerCase() === t.toLowerCase())) merged.push(t);
        });
        tagSelector.value = merged.slice(0, 7);
      }
      if (tagSelector && typeof restoreState.tagInput === "string") {
        tagSelector.inputValue = restoreState.tagInput;
      }

      if (typeof restoreState.step === "number" && restoreState.step !== STEP_DONE) {
        restoredStep = restoreState.step;
      }
      // Left on the verify step and came back verified (the emailed link,
      // opened in this tab): the question is answered, so go on to the one
      // after it rather than ask it again.
      if (restoredStep === STEP_VERIFY && emailVerified) restoredStep = STEP_VISIBILITY;
      clearTransientState();
    }

    // Save state before navigating away (e.g. clicking the lang toggle).
    // Re-binding is safe because nav-lang is `transition:persist`-ed across
    // navigations, so remove any previous handler first.
    // #footer-lang is the phone's copy of the switch (SiteFooter.astro). It
    // is re-rendered with every page, so a fresh one needs binding each time
    // and a stale one leaves with its page.
    const navLang = document.getElementById("nav-lang");
    const footerLang = document.getElementById("footer-lang");
    if (prevNavLangHandler) {
      navLang?.removeEventListener("click", prevNavLangHandler, { capture: true });
      footerLang?.removeEventListener("click", prevNavLangHandler, { capture: true });
    }
    if (prevPageHideHandler) {
      window.removeEventListener("pagehide", prevPageHideHandler);
    }
    const onNavLangClick = () => saveTransientState();
    const onPageHide = () => saveTransientState();
    navLang?.addEventListener("click", onNavLangClick, { capture: true });
    footerLang?.addEventListener("click", onNavLangClick, { capture: true });
    window.addEventListener("pagehide", onPageHide);
    prevNavLangHandler = onNavLangClick;
    prevPageHideHandler = onPageHide;

    const verifyEmailEl = document.getElementById("ob-verify-email");
    if (verifyEmailEl) verifyEmailEl.textContent = user.email ?? "";
    syncVisibilityStep();
    if (!user.emailVerified) {
      // The gallery cap is one image until verification; say so before the
      // member picks a second file rather than after (2026-09-03).
      //
      // The banner that used to be wired up here is gone (see the note where
      // it stood), and with it this block's resend — the verify step owns
      // that now, cooldown included.
      galleryVerified = false;
      updateGalleryNotes();
    }

    if (loadingEl) loadingEl.style.display = "none";
    if (wrap) wrap.style.display = "block";
    setStep(restoredStep);
  }

  unsubscribeAuth?.();
  unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    unsubscribeAuth?.();
    unsubscribeAuth = null;
    if (!user) {
      if (loadingEl) loadingEl.style.display = "none";
      wrap.style.display = "block";
      setStep(-1);
      return;
    }
    onUserAuthenticated(user).catch(() => {});
  });

  document.getElementById("ob-start-auth")?.addEventListener("click", () => {
    const ctaEl = document.getElementById("ob-auth-cta");
    const formEl = document.getElementById("ob-auth-form");
    if (ctaEl) ctaEl.style.display = "none";
    if (formEl) formEl.style.display = "";
    document.getElementById("ob-email")?.focus();
  });

  document.getElementById("ob-next-auth")?.addEventListener("click", async () => {
    const emailEl = document.getElementById("ob-email") as HTMLInputElement;
    const passwordEl = document.getElementById("ob-password") as HTMLInputElement;
    const confirmEl = document.getElementById("ob-password-confirm") as HTMLInputElement;
    const email = emailEl.value.trim();
    const password = passwordEl.value;
    const confirm = confirmEl.value;

    if (!email) { setError(s["auth.error.enterEmail"]); return; }
    if (!password) { setError(s["onboarding.auth.error.weak"]); return; }
    if (password !== confirm) { setError(s["onboarding.auth.error.mismatch"]); return; }
    // Pre-flight: a Turnstile script that never loaded would make the Auth
    // call below hang for 30 s and then blame the internet connection (see
    // appCheckTurnstile.ts). Say what is actually wrong, now.
    if (isSecurityCheckBlocked()) { setError(friendlyError(SECURITY_CHECK_BLOCKED, s)); return; }

    setBtnState("ob-next-auth", true, s["onboarding.nav.next"]);
    setError("");

    // Set when account creation hits an address that already exists, so a
    // credential failure from the sign-in below can be reported as the
    // collision it is. Declared out here to outlive the inner catch.
    let emailWasTaken = false;

    try {
      let userCredential;
      let isNewUser = false;
      try {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        isNewUser = true;
      } catch (createErr: unknown) {
        if ((createErr as { code?: string }).code === "auth/email-already-in-use") {
          // Signing in with the password just typed lets a member who
          // abandoned onboarding resume it through the Join button without
          // ever being told they already have an account. That silence is
          // deliberate; the collision is only news if the password differs.
          emailWasTaken = true;
          userCredential = await signInWithEmailAndPassword(auth, email, password);
        } else {
          throw createErr;
        }
      }
      const user = userCredential.user;
      if (isNewUser) {
        // Was written only by AuthForm's signup branch, so accounts made
        // through the wizard had no createdAt at all. That branch is gone;
        // this is now the only door, and it writes the field.
        await createUser(user.uid, { createdAt: new Date() }).catch(() => {});
        // users/{uid}.email is server-written: the callable reads the address
        // off the caller's own token and merge-creates the doc. The client
        // cannot write the field itself — firestore.rules pins it.
        await syncEmail().catch(() => {});
        await sendEmailVerification(user, returnTo(lang, "/onboarding")).catch(() => {});
      }
      await onUserAuthenticated(user);
    } catch (err: unknown) {
      const { code, detail } = errorParts(err);
      let msg: string;
      if (code === "auth/weak-password") msg = s["onboarding.auth.error.weak"];
      else if (code === "auth/invalid-email") msg = s["auth.error.enterEmail"];
      // A credential failure that FOLLOWS a collision is not a typo in a new
      // password: the address belongs to an existing account and this is not
      // its password. "Invalid email or password. Please try again." is
      // baffling on a form where the member is inventing one, and the retry
      // it advises fails identically.
      else if (emailWasTaken && isCredentialError(code)) msg = s["auth.error.code.emailInUse"];
      else if (isCredentialError(code)) msg = s["onboarding.auth.error.invalid"];
      // Everything else used to be reported as a wrong password — a blocked
      // network, a permission-denied, an operation-not-allowed all looked
      // like a typo. Show the generic sentence with the code attached so the
      // member can report exactly what failed. The detail rides along for
      // the network code, where it tells a blocked auth host from a hung
      // security check.
      else msg = friendlyError(code, s, detail);
      setError(msg);
      setBtnState("ob-next-auth", false, s["onboarding.nav.next"]);
    }
  });
});
