import { persistWorkMetadata } from "./profilePersistence.ts";
import { confirmDialog } from "./confirmDialog.ts";
import { bindTabKeys } from "./uiTabs.ts";
import { watchPublication } from "./publicationStatus.ts";
import { editorDraft } from "./editorDraft.ts";
import { auth } from "./firebase.ts";
import {
  signOut,
  reauthenticateWithCredential,
  EmailAuthProvider,
  sendEmailVerification,
  verifyBeforeUpdateEmail,
  type User,
} from "firebase/auth";
import { returnTo } from "./authEmail.ts";
import { hasVerifiedClaim, requireAuth } from "./auth.ts";
import { providerName } from "./embed.ts";
import { getUser, getPublicProfileActive, setProfileActive } from "./firestore.ts";
import { markImageForDeletion } from "./images.ts";
import {
  cancelAccountDeletion,
  ensureEmailSynced,
  requestAccountDeletion,
} from "./account.ts";
import { validateAvatar, resizeAvatar, validateBio, validateSocialMedia } from "./validation.ts";
import { handleProfileUpdate, triggerRebuild } from "./profile.ts";
import { isMemberType, MEMBER_TYPES } from "./firestore.ts";
import { memberTypeFieldCopy, needsVisuals } from "./memberType.ts";
import {
  MAX_GALLERY_IMAGES,
  galleryLimit,
  MAX_GALLERY_CAPTION,
  MAX_GALLERY_DESCRIPTION,
  MAX_GALLERY_LINK,
  galleryErrorCode,
  loadGallery,
  galleryIds,
  addVideoLink,
  restoreAutoThumbnail,
  embedErrorCode,
  type GalleryItem,
} from "./gallery.ts";
import {
  createGalleryQueue,
  galleryErrorKey,
  isRetryable,
  type GalleryTask,
} from "./galleryQueue.ts";
import { updateUserProfile } from "./firestore.ts";
import {
  contiguousOrder,
  editorBlocks,
  inheritedSiteLink,
  MAX_AFFILIATION_NAME,
  MAX_AFFILIATION_URL,
  MAX_AFFILIATIONS,
  MAX_PROJECT_DESCRIPTION,
  MAX_PROJECT_LINK,
  MAX_PROJECT_TITLE,
  type EditorBlock,
} from "./projects.ts";
import {
  deleteProjects,
  loadMemberOptions,
  loadProjects,
  memberSlugs,
  type MemberOption,
} from "./projectStore.ts";
import {
  applyBlocks,
  dissolveProject,
  editorAffiliations,
  insertUploaded,
  memberUidFor,
  moveImage,
  moveProject,
  moveToProject,
  orderProjects,
  previewProjects,
  projectLabel,
  projectsToDelete,
  removeFromProject,
  sameIds,
  withoutDanglingProjects,
  type EditorAffiliation,
  type EditorProject,
} from "./projectEditor.ts";
import { bindPreviewLightbox, renderCardPreview, renderProfilePreview } from "./profilePreview.ts";
import { lightboxStringsFrom } from "./lightbox.ts";
import type { Lang } from "../i18n/utils";
import "photoswipe/style.css";
// Immediately after the package sheet, never before: this is the chrome that
// replaces it — the same pair, in the same order, as the member page.
import "../styles/lightbox.css";
import {
  splitSocial,
  joinSocial,
  workLink,
  workCaption,
  profileRole,
  profileBio,
  workDescription,
  MAX_SOCIAL_LINKS,
  MAX_SOCIAL_MEDIA,
} from "./links.ts";
import { ui } from "../i18n/translations.ts";
import {
  isSiteLanguage,
  localePath,
  preferredLocaleTarget,
  readSessionChoice,
  rememberSessionChoice,
} from "./siteLanguage.ts";

let unsubscribeAuth: (() => void) | null = null;

document.addEventListener("astro:page-load", () => {
  const loadingEl = document.getElementById("loading");
  const form = document.getElementById("profile-form") as HTMLFormElement;
  if (!form) return;
  const lifecycle = new AbortController();
  let draft: ReturnType<typeof editorDraft> | undefined;
  document.addEventListener("astro:before-swap", () => {
    draft?.dispose(); lifecycle.abort(); unsubscribeAuth?.(); unsubscribeAuth = null;
    loadGeneration++; clearTimeout(authWatchdog);
  }, { once: true });

  const lang = form.dataset.lang === "de" ? "de" : "en";
  const s = ui[lang] ?? ui.en;
  const prefix = lang === "de" ? "/de" : "";
  // EVERYTHING THE DIRECTORY CARD SAYS THAT ITS MARKUP CANNOT CARRY. The
  // real card resolves these with useTranslations() at build time; the
  // preview is filled in the browser from live form state, so the strings
  // have to arrive as values. Most of them are the CAROUSEL's — the preview
  // renders the card's own paging element as of 2026-09-02, and a carousel
  // with no accessible name, no position label and unlabelled arrows would
  // be the same element minus everything that makes it usable.
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
    lang: lang as Lang,
  };

  const nameInput = document.getElementById("name") as HTMLInputElement;
  const roleInput = document.getElementById("role") as HTMLInputElement;
  const roleDeInput = document.getElementById("role-de") as HTMLInputElement;
  const activeInput = document.getElementById("profile-active") as HTMLInputElement;
  const wantsToContributeInput = document.getElementById(
    "wants-to-contribute"
  ) as HTMLInputElement;
  const preferredLanguageInput = document.getElementById("preferred-language") as HTMLSelectElement;
  const receiveCommunityEmailsInput = document.getElementById("receive-community-emails") as HTMLInputElement;
  const receiveCommunityEmailsNote = document.getElementById("receive-community-emails-note")!;
  let communityEmailPreferenceKnown = false;
  let communityEmailPreferenceChanged = false;
  receiveCommunityEmailsInput.addEventListener("change", () => {
    communityEmailPreferenceChanged = true;
  });
  const bioInput = document.getElementById("bio") as HTMLTextAreaElement;
  const bioDeInput = document.getElementById("bio-de") as HTMLTextAreaElement;
  const portfolioInput = document.getElementById("portfolio") as HTMLInputElement;
  const socialEditor = document.getElementById("social-editor")!;
  const socialAdd = document.getElementById("social-add") as HTMLButtonElement;
  const socialStatus = document.getElementById("social-status")!;
  const socialRowTpl = document.querySelector<HTMLTemplateElement>('[data-social-tpl="row"]');
  const phoneInput = document.getElementById("phone") as HTMLInputElement;
  const primaryAudienceInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="primary-audience"]')
  );
  const avatarInput = document.getElementById("avatar") as HTMLInputElement;
  const avatarImg = document.getElementById("avatar-preview") as HTMLImageElement;
  const uploadStatus = document.getElementById("upload-status")!;
  const saveMsg = document.getElementById("save-msg")!;
  const saveError = document.getElementById("save-error")!;
  const saveButton = document.getElementById("save-button") as HTMLButtonElement;

  /** Disabled AND visibly working — see .profile-save-button.is-saving. */
  function setSaving(on: boolean) {
    form.setAttribute("aria-busy", String(on));
    form.querySelectorAll<HTMLElement>(".form-section, .editor-recovery, #section-tabs").forEach(section => { section.inert = on; });
    saveButton.disabled = on;
    saveButton.classList.toggle("is-saving", on);
    saveButton.textContent = on ? s["profile.save.saving"] : s["profile.save"];
  }

  const avatarWrap = avatarImg.closest<HTMLElement>(".avatar-wrap")!;

  // Tag selection is handled by the <tag-selector> custom element. Scoped to
  // #member-tags-field: since 2026-09-08 every gallery row carries its own
  // <tag-selector> too (see renderGallery), and an unscoped query would
  // match whichever one happens to render first in DOM order.
  const tagSelector = document.querySelector<
    HTMLElement & {
      value: string[];
      inputValue: string;
    }
  >("#member-tags-field tag-selector");
  const openToSelector = document.querySelector<
    HTMLElement & {
      value: string[];
    }
  >("open-to-selector");
  const memberTypeSelector = document.querySelector<
    HTMLElement & {
      value: string;
    }
  >("member-type-selector");
  const portfolioLabel = document.getElementById("portfolio-label");
  const socialLabel = document.getElementById("social-label");
  const affiliationInput = document.getElementById("affiliation") as HTMLInputElement;
  const locationInput = document.getElementById("location") as HTMLInputElement;
  const languageInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="language"]')
  );
  const visualNeedsSelector = document.querySelector<
    HTMLElement & {
      value: string[];
    }
  >("visual-needs-selector");

  function getSelectedLanguages() {
    // Emitted in LANGUAGES order, not click order, so the stored list is
    // stable and the rules' unrolled enum check sees a predictable shape.
    return languageInputs.filter((input) => input.checked).map((input) => input.value);
  }

  function setSelectedLanguages(value: unknown) {
    const selected = Array.isArray(value) ? value.filter(Boolean).map(String) : [];
    languageInputs.forEach((input) => {
      input.checked = selected.includes(input.value);
    });
  }

  // The profile-page preview shell and the section tabs.
  // Addressed by a data attribute, not by a class: the shell's classes are
  // now the profile page's own (.mprof*), shared with the real page, and a
  // hook that doubles as a style selector is exactly how the two drifted
  // apart before.
  const profileViewRoot = document.querySelector<HTMLElement>("[data-ppv-root]");
  // The Preview tab's pictures open the site's lightbox, as they do on the
  // page and the card they preview. Bound once per page load; the renderers
  // replace the pictures under it (see bindPreviewLightbox).
  const unbindPreviewLightbox = bindPreviewLightbox(
    {
      works: profileViewRoot?.querySelector<HTMLElement>('[data-ppv="works"]'),
      card: document.querySelector<HTMLElement>("[data-ccpv-root]"),
    },
    lightboxStringsFrom(s),
  );
  document.addEventListener("astro:before-swap", unbindPreviewLightbox, { once: true });
  const sectionTabs = Array.from(
    document.querySelectorAll<HTMLButtonElement>("#section-tabs .section-tab")
  );
  const formSections = Array.from(form.querySelectorAll<HTMLElement>(".form-section"));

  bindTabKeys(sectionTabs, tab => setSection(tab.dataset.section!), lifecycle.signal);

  let avatarProcessing = false;
  let resizedAvatarBlob: Blob | null = null;
  let avatarColor = "";
  let gallery: GalleryItem[] = [];
  // PROJECTS (2026-09-23): the member's project blocks, in load order then
  // creation order. `storedProjectIds` is what Firestore held at load or at
  // the last Save — the create-vs-update line for saveProjects(), and the
  // reason a block created and never filled can be dropped without a
  // delete. `deletedProjectIds` remembers blocks removed through the menu,
  // which are gone from `projects` by the time Save asks what to delete.
  // `previewSlugs` is uid → current slug for the preview's member credits.
  let projects: EditorProject[] = [];
  let storedProjectIds = new Set<string>();
  const deletedProjectIds = new Set<string>();
  let previewSlugs = new Map<string, string>();
  /** Which EN/DE pane a project block shows — UI-only, keyed by projectId, like galleryLangUI. */
  const projectLangUI = new Map<string, "en" | "de">();
  // The member type-ahead's options, loaded once on the first Member-mode
  // focus: every visible member's display name, the way the directory
  // shows it. A typed name resolves to the first member wearing it.
  let memberOptions: MemberOption[] | null = null;
  let memberOptionsLoad: Promise<void> | null = null;

  function ensureMemberOptions(): Promise<void> {
    if (memberOptions) return Promise.resolve();
    memberOptionsLoad ??= loadMemberOptions()
      .then((options) => {
        memberOptions = options;
        memberOptionsList.replaceChildren(
          ...options.map((m) => Object.assign(document.createElement("option"), { value: m.name })),
        );
      })
      .catch(() => {
        // Next focus tries again; until then the list is simply empty.
        memberOptionsLoad = null;
      });
    return memberOptionsLoad;
  }
  // Which of a gallery item's EN/DE panes is open — UI-only, never saved,
  // and kept outside renderGallery() so it survives the re-renders that
  // function does on every add/remove/reorder. Keyed by imageId; see the
  // switch wiring in renderGallery() for why index would not do.
  const galleryLangUI = new Map<string, "en" | "de">();
  // Whether a gallery item's tag fold is open — same shape, same reason, same
  // imageId key as galleryLangUI above (2026-09-17). Unknown means open, so a
  // row the member has never touched matches the template's `open`.
  const galleryTagsOpenUI = new Map<string, boolean>();
  // Whether a row's whole details fold is open (2026-09-24). Unknown means
  // FOLDED — the opposite default to the tags — so every image already in
  // the gallery at page load starts short; onGalleryUploaded() marks each
  // new work open before its row is first drawn.
  const galleryDetailsOpenUI = new Map<string, boolean>();
  // The same for a project block's words (2026-09-25), keyed by projectId:
  // unknown = folded, and newProject() opens the block it adds.
  const projectDetailsOpenUI = new Map<string, boolean>();
  // A project block's tag fold (2026-09-27): galleryTagsOpenUI's rule,
  // keyed by projectId. Unknown = open, as the template draws it.
  const projectTagsOpenUI = new Map<string, boolean>();
  // The images/ record behind the current avatar. Passed to
  // handleProfileUpdate so the replaced record can be marked for deletion
  // once the new photoURL has landed in Firestore.
  let currentPhotoImageId = "";

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === "de" ? "de-CH" : "en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  const galleryInput = document.getElementById("gallery-files") as HTMLInputElement;
  const galleryReplaceInput = document.getElementById("gallery-replace-file") as HTMLInputElement;
  /** The work whose "Replace image" opened the picker; read once, when a file arrives. */
  let galleryReplaceTarget: string | null = null;
  const galleryEditor = document.getElementById("gallery-editor")!;
  const galleryQueueEl = document.getElementById("gallery-queue")!;
  const galleryDrop = document.getElementById("gallery-drop")!;
  // By id since 2026-09-23: project blocks inside the list carry their own
  // .choose-img pickers, and the first match in the drop zone is one of those.
  const galleryAdd = document.getElementById("gallery-add") as HTMLLabelElement;
  const galleryStatus = document.getElementById("gallery-status")!;
  // Row shells for the two list editors. Cloned rather than built: see the
  // comment on each <template> above — Astro's scope attribute is on the
  // selectors, so a createElement() row matches none of the scoped rules.
  const galleryItemTpl = document.querySelector<HTMLTemplateElement>('[data-gallery-tpl="item"]');
  const galleryTaskTpl = document.querySelector<HTMLTemplateElement>('[data-gallery-tpl="task"]');
  const galleryProjectTpl = document.querySelector<HTMLTemplateElement>('[data-gallery-tpl="project"]');
  const galleryAffiliationTpl = document.querySelector<HTMLTemplateElement>('[data-gallery-tpl="affiliation"]');
  const memberOptionsList = document.getElementById("gallery-member-options") as HTMLDataListElement;
  const galleryNewProject = document.getElementById("gallery-new-project") as HTMLButtonElement;
  // The video link field (2026-09-23) — see its markup, and the handlers
  // beside the replace picker's below.
  const galleryVideoUrl = document.getElementById("gallery-video-url") as HTMLInputElement;
  const galleryVideoAdd = document.getElementById("gallery-video-add") as HTMLButtonElement;
  const galleryVideoStatus = document.getElementById("gallery-video-status")!;
  const galleryVideoPanel = document.getElementById("gallery-video")!;
  const galleryVideoOpen = document.getElementById("gallery-video-open") as HTMLButtonElement;
  const galleryVideoCancel = document.getElementById("gallery-video-cancel") as HTMLButtonElement;
  /** Links being resolved right now. Each holds a gallery place until it lands or fails. */
  let videoPending = 0;
  /** Works whose automatic thumbnail is on its way back. */
  const restoringThumbs = new Set<string>();

  function setGalleryStatus(text: string) {
    galleryStatus.textContent = text;
    galleryStatus.style.display = text ? "block" : "none";
  }

  /**
   * These controls have no visible label — the field's own label covers the
   * group, and a per-row caption would triple the form's text. The name goes
   * on the control itself, as this file already does for the remove buttons,
   * so it is announced without being drawn.
   */
  function named<T extends HTMLElement>(control: T, label: string): T {
    control.setAttribute("aria-label", label);
    return control;
  }

  // ── Social links ──────────────────────────────────────
  // One row per link on screen; ONE comma-joined string in Firestore. The
  // stored shape is deliberately unchanged: every profile saved before today
  // holds that string, and the public directory is a build-time snapshot, so
  // a second shape would have to be understood by pages that will not be
  // rebuilt for it. splitSocial()/joinSocial() in links.ts are the whole
  // translation, and the same links.ts cleaner shapes them for display.
  //
  // Order is row order, and it survives: new rows append, removing one
  // splices, and joinSocial() preserves what it is given.
  let socialValues: string[] = [""];
  let socialPlaceholder = s["profile.ph.social"];

  function setSocialStatus(text: string) {
    socialStatus.textContent = text;
    socialStatus.style.display = text ? "block" : "none";
  }

  /** The single stored value the rows add up to. */
  function socialStored(): string {
    return joinSocial(socialValues);
  }

  function refreshSocialStatus() {
    socialAdd.disabled = socialValues.length >= MAX_SOCIAL_LINKS;
    // Length, not count, is the real limit — firestore.rules caps the joined
    // field at MAX_SOCIAL_MEDIA and rejects the WHOLE write over it, so the
    // member has to hear about it here rather than as a permission error.
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
    if (!socialRowTpl) return;
    socialEditor.replaceChildren(
      ...socialValues.map((value, index) => {
        const row = socialRowTpl.content.firstElementChild?.cloneNode(true);
        if (!(row instanceof HTMLElement)) return null;
        const input = row.querySelector<HTMLInputElement>("[data-social-input]");
        const remove = row.querySelector<HTMLButtonElement>("[data-social-remove]");
        if (!input || !remove) return null;

        input.value = value;
        input.placeholder = socialPlaceholder;
        // Rows share one field label, so the position is what tells them
        // apart to anyone who cannot see the stack.
        named(input, `${socialLabel?.textContent ?? ""} ${index + 1}`.trim());
        input.addEventListener("input", () => {
          socialValues[index] = input.value;
          refreshSocialStatus();
          syncPreview();
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
    // Always at least one row: this field was a text box until today, and an
    // empty stack with only a button reads as a missing field rather than an
    // empty one. The blank row costs nothing — joinSocial() drops it.
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
      .querySelector<HTMLInputElement>(".social-row:last-of-type [data-social-input]")
      ?.focus();
  }

  /** Removing the only row empties it rather than leaving no field at all. */
  function removeSocialRow(index: number) {
    if (socialValues.length <= 1) socialValues = [""];
    else socialValues.splice(index, 1);
    renderSocial();
    syncPreview();
  }

  socialAdd.addEventListener("click", addSocialRow);

  /**
   * The upload queue. Everything that used to happen inside the file-input
   * change handler — validate, compress, upload, one at a time, behind a
   * single shared status line — now happens here, as a list of tasks that
   * each carry their own state. See src/lib/galleryQueue.ts for why that is
   * the shape.
   */
  const galleryQueue = createGalleryQueue({
    // Read late, never captured: a queue can outlive a session.
    uid: () => auth.currentUser?.uid ?? null,
    // The member's OWN ceiling, not the absolute one: an unverified account
    // holds a single image, and a queue that let it pick eight would collect
    // seven permission errors on the member's behalf.
    capacity: () => galleryLimit(auth.currentUser) - gallery.length - videoPending,
    onChange: renderQueue,
    onUploaded: (item) => void onGalleryUploaded(item),
    onReplaced: (item, replaced) => void onGalleryReplaced(item, replaced),
  });
  document.addEventListener("astro:before-swap", () => galleryQueue.dispose(), { once: true });

  /**
   * Where focus goes after a re-render: back onto the ↑/↓ or the project
   * select of the row just moved, the header's ↑/↓, or into a block's field.
   * Without it, pressing ↓ moves the row, wipes the node the keyboard was
   * on, and drops focus to the document — so moving an image two places
   * would take a fresh click each time.
   */
  type RowControl = "up" | "down" | "project";
  type FocusHint = { imageId: string; control: RowControl } | { projectId: string; field?: string; control?: "up" | "down" };

  /**
   * Renders the committed gallery. `focusHint`: see FocusHint above.
   */
  // The folded rows' summaries speak the preferred language.
  preferredLanguageInput.addEventListener("change", () => renderGallery());

  function renderGallery(focusHint?: FocusHint) {
    if (!galleryItemTpl || !galleryProjectTpl) return;
    // The list's shape: loose rows and project blocks in gallery order, then
    // the projects no image names yet (2026-09-23, editorBlocks in
    // projects.ts). Every move below is a pure function over this list.
    const blocks = editorBlocks(gallery, projects);
    // Where the caret was, so it can be put back. replaceChildren() destroys
    // the node it was in, and uploads now COMPLETE WHILE YOU TYPE — that is
    // the point of the queue — so a member writing a caption for image two
    // would have the field yanked out from under them each time one of the
    // other five landed. The old serial flow rendered rarely enough to get
    // away with this; concurrency does not.
    //
    // Keyed by imageId / projectId, not by position (2026-09-23): an upload
    // into a project lands INSIDE its block, so rows below it shift, and a
    // position would put the caret back into a neighbour's caption.
    const typing = document.activeElement;
    const typingIn =
      typing instanceof HTMLInputElement || typing instanceof HTMLTextAreaElement
        ? {
            imageId: typing.closest<HTMLElement>("[data-gallery-index]")?.dataset.imageId,
            projectId: typing.closest<HTMLElement>("[data-project-block]")?.dataset.projectId,
            // An affiliation input is found by its row's position and its
            // own field name, so the two selectors below can stay literal.
            affIndex: typing.closest<HTMLElement>("[data-aff-index]")?.dataset.affIndex,
            field: typing.dataset.galleryField ?? typing.dataset.projectField ?? typing.dataset.affField,
            start: typing.selectionStart,
            end: typing.selectionEnd,
          }
        : null;
    const buildRow = (index: number): HTMLElement | null => {
          const item = gallery[index];
          const row = galleryItemTpl.content.firstElementChild?.cloneNode(true);
          if (!(row instanceof HTMLElement)) return null;
          const field = <T extends HTMLElement>(name: string) =>
            row.querySelector<T>(`[data-gallery-field="${name}"]`);
          const img = row.querySelector<HTMLImageElement>("[data-gallery-img]");
          const remove = row.querySelector<HTMLButtonElement>("[data-gallery-remove]");
          const caption = field<HTMLInputElement>("caption");
          const captionDe = field<HTMLInputElement>("captionDe");
          const description = field<HTMLTextAreaElement>("description");
          const descriptionDe = field<HTMLTextAreaElement>("descriptionDe");
          const link = field<HTMLInputElement>("link");
          const siteLink = field<HTMLInputElement>("siteLink");
          const cover = row.querySelector<HTMLElement>("[data-gallery-cover]");
          const moveUp = row.querySelector<HTMLButtonElement>('[data-gallery-move="up"]');
          const moveDown = row.querySelector<HTMLButtonElement>('[data-gallery-move="down"]');
          const projectSelect = row.querySelector<HTMLSelectElement>("[data-gallery-project]");
          const langBtns = Array.from(
            row.querySelectorAll<HTMLButtonElement>("[data-gallery-lang-btn]"),
          );
          const langPaneEn = row.querySelector<HTMLElement>('[data-gallery-lang-pane="en"]');
          const langPaneDe = row.querySelector<HTMLElement>('[data-gallery-lang-pane="de"]');
          const tagsSelector = row.querySelector<HTMLElement & { value: string[] }>(
            "tag-selector",
          );
          const tagsFold = row.querySelector<HTMLDetailsElement>(".gallery-tags");
          const tagsCount = row.querySelector<HTMLElement>("[data-gallery-tags-count]");
          const detailsFold = row.querySelector<HTMLDetailsElement>(".gallery-details");
          const summary = row.querySelector<HTMLElement>("[data-gallery-summary]");
          const summaryTitle = row.querySelector<HTMLElement>("[data-gallery-summary-title]");
          const summaryTags = row.querySelector<HTMLElement>("[data-gallery-summary-tags]");
          if (!img || !remove || !caption || !description) return null;
          if (!summary || !summaryTitle || !summaryTags) return null;
          if (!tagsFold || !tagsCount || !detailsFold) return null;
          if (!captionDe || !descriptionDe) return null;
          if (!link || !siteLink || !cover || !tagsSelector) return null;
          if (!moveUp || !moveDown || !projectSelect) return null;
          const replace = row.querySelector<HTMLButtonElement>("[data-gallery-replace]");
          if (!replace) return null;
          if (langBtns.length !== 2 || !langPaneEn || !langPaneDe) return null;

          // The one thing on screen that admits the order means something:
          // CommunityImageCard takes works[0]'s width/height as the aspect
          // box of the whole card, so this image decides its silhouette.
          cover.hidden = index !== 0;
          cover.textContent = s["profile.gallery.cover"];

          img.src = item.url;
          named(remove, s["profile.gallery.remove"]).title = s["profile.gallery.remove"];
          remove.addEventListener("click", () => removeGalleryImage(index));

          caption.value = item.caption ?? "";
          caption.maxLength = MAX_GALLERY_CAPTION;
          caption.placeholder = s["profile.gallery.caption.ph"];
          named(caption, s["profile.gallery.caption"]);
          // The folded row's summary (see the template): the title
          // in the member's PREFERRED language (Josh: "in the preferred
          // language"), the form's live choice rather than the saved one,
          // falling back to the other language; then the picked tags.
          // Repainted on every edit, so closing Details shows what was just
          // written, and re-rendered when the preference changes (below).
          const paintSummary = () => {
            const w = gallery[index];
            const [first, second] =
              preferredLanguageInput.value === "de" ? [w.captionDe, w.caption] : [w.caption, w.captionDe];
            const title = (first?.trim() || second?.trim()) ?? "";
            const tags = w.tags ?? [];
            summaryTitle.textContent = title;
            summaryTitle.hidden = !title;
            summaryTags.replaceChildren(
              ...tags.map((tag) => {
                const chip = document.createElement("span");
                chip.className = "tagchip";
                chip.textContent = tag;
                return chip;
              }),
            );
            summaryTags.hidden = tags.length === 0;
            summary.hidden = detailsFold.open || (!title && tags.length === 0);
          };
          detailsFold.open = galleryDetailsOpenUI.get(item.imageId) ?? false;
          detailsFold.addEventListener("toggle", () => {
            galleryDetailsOpenUI.set(item.imageId, detailsFold.open);
            paintSummary();
          });
          caption.addEventListener("input", () => {
            gallery[index].caption = caption.value;
            syncPreview();
          });

          captionDe.value = item.captionDe ?? "";
          captionDe.maxLength = MAX_GALLERY_CAPTION;
          captionDe.placeholder = s["profile.gallery.caption.de.ph"];
          named(captionDe, s["profile.gallery.caption.de"]);
          captionDe.addEventListener("input", () => {
            gallery[index].captionDe = captionDe.value;
            syncPreview();
          });

          description.value = item.description ?? "";
          description.maxLength = MAX_GALLERY_DESCRIPTION;
          description.placeholder = s["profile.gallery.description.ph"];
          named(description, s["profile.gallery.description.label"]);
          description.addEventListener("input", () => {
            gallery[index].description = description.value;
            paintSummary();
            syncPreview();
          });

          descriptionDe.value = item.descriptionDe ?? "";
          descriptionDe.maxLength = MAX_GALLERY_DESCRIPTION;
          descriptionDe.placeholder = s["profile.gallery.description.de.ph"];
          named(descriptionDe, s["profile.gallery.description.de"]);
          descriptionDe.addEventListener("input", () => {
            gallery[index].descriptionDe = descriptionDe.value;
            paintSummary();
            syncPreview();
          });

          // THE MODAL SWITCH (2026-09-04, Josh: "make it into a modal
          // switch"). State lives OUTSIDE this render function, keyed by
          // imageId rather than index — renderGallery() rebuilds every row
          // from scratch on any add/remove/reorder, and an index-keyed map
          // would hand a reordered row someone else's open pane. imageId is
          // assigned before this item can even appear in `gallery` (see
          // uploadGalleryImage in gallery.ts), so it is stable for exactly
          // as long as the row is.
          const setGalleryLang = (lang: "en" | "de") => {
            galleryLangUI.set(item.imageId, lang);
            langBtns.forEach((btn) => {
              const active = btn.dataset.galleryLangBtn === lang;
              btn.classList.toggle("is-active", active);
              btn.setAttribute("aria-pressed", String(active));
            });
            langPaneEn.hidden = lang !== "en";
            langPaneDe.hidden = lang !== "de";
          };
          langBtns.forEach((btn) => {
            const btnLang = btn.dataset.galleryLangBtn === "de" ? "de" : "en";
            named(btn, s[`profile.gallery.lang.${btnLang}`]);
            btn.addEventListener("click", () => setGalleryLang(btnLang));
          });
          setGalleryLang(galleryLangUI.get(item.imageId) ?? "en");

          // The two per-image links, wired identically — they differ in
          // what they MEAN, not in how they are stored (2026-09-10).
          const wireLink = (
            input: HTMLInputElement,
            key: "link" | "siteLink",
            labelKey: "profile.gallery.link" | "profile.gallery.siteLink",
            phKey: "profile.gallery.link.ph" | "profile.gallery.siteLink.ph",
          ) => {
            input.value = item[key] ?? "";
            input.maxLength = MAX_GALLERY_LINK;
            input.placeholder = s[phKey];
            named(input, s[labelKey]);
            input.addEventListener("input", () => {
              // Deleted rather than stored empty, because firestore.rules only
              // permits the keys it knows and an empty string is not a link —
              // the same reason `projectId` was deleted rather than blanked
              // when its select was cleared.
              const value = input.value.trim();
              if (value) gallery[index][key] = value;
              else delete gallery[index][key];
              syncPreview();
            });
          };
          wireLink(siteLink, "siteLink", "profile.gallery.siteLink", "profile.gallery.siteLink.ph");
          wireLink(link, "link", "profile.gallery.link", "profile.gallery.link.ph");

          // What a FOLDED row still says about the picture: with the chips
          // out of sight the number is the only thing left that answers "did
          // I tag this one?".
          const setTagsCount = (tags: string[]) => {
            tagsCount.textContent = tags.length ? `(${tags.length})` : "";
          };

          tagsSelector.value = item.tags ?? [];
          setTagsCount(item.tags ?? []);
          paintSummary();
          tagsFold.open = galleryTagsOpenUI.get(item.imageId) ?? true;
          tagsFold.addEventListener("toggle", () => {
            galleryTagsOpenUI.set(item.imageId, tagsFold.open);
          });
          named(tagsSelector, s["profile.label.tags"]);
          tagsSelector.addEventListener("change", () => {
            // Same "deleted rather than stored empty" rule as link above —
            // gallery[index] is what saveGalleryRecords() reads at Save.
            const tags = tagsSelector.value;
            if (tags.length) gallery[index].tags = tags;
            else delete gallery[index].tags;
            setTagsCount(tags);
            paintSummary();
            syncPreview();
          });

          // ↑/↓ within the row's container (moveImage: a loose row steps
          // past the neighbouring block, a row inside a project stays
          // inside it). Disabled, not hidden, at an edge: a button that
          // vanished would make the row's tools jump.
          const wireMove = (button: HTMLButtonElement, delta: -1 | 1, control: RowControl) => {
            const next = moveImage(blocks, index, delta);
            const label = s[delta < 0 ? "profile.gallery.moveUp" : "profile.gallery.moveDown"];
            named(button, label).title = label;
            button.disabled = next === null;
            button.addEventListener("click", () => void applyBlockMove(next, { imageId: item.imageId, control }));
          };
          wireMove(moveUp, -1, "up");
          wireMove(moveDown, 1, "down");

          // THE PROJECT DROPDOWN (2026-09-25). A project joins the image
          // at the END of that block (moveToProject); "No project" lands it
          // directly below the block it left (removeFromProject).
          // Membership is written at Save, like every field here.
          const current = item.projectId && projects.some((p) => p.projectId === item.projectId) ? item.projectId : "";
          const projectWrap = projectSelect.closest<HTMLElement>("[data-gallery-project-wrap]");
          if (projectWrap) projectWrap.hidden = projects.length === 0;
          named(projectSelect, s["profile.project.select"]).title = s["profile.project.select"];
          const none = new Option(s["profile.project.none"], "");
          projectSelect.replaceChildren(
            none,
            ...projects.map((p) => new Option(projectLabel(projects, p.projectId, lang, s["profile.project.untitled"]), p.projectId)),
          );
          projectSelect.value = current;
          projectSelect.addEventListener("change", () => {
            const target = projectSelect.value;
            const next = target ? moveToProject(blocks, index, target) : removeFromProject(blocks, index);
            void applyBlockMove(next, { imageId: item.imageId, control: "project" });
          });

          // New picture, same work: captions, description, links, tags and
          // position all stay. Disabled while one is already on its way —
          // see updateGalleryControls, which the queue repaints through.
          named(replace, s["profile.gallery.replace"]).title = s["profile.gallery.replace"];
          replace.dataset.imageId = item.imageId;
          replace.addEventListener("click", () => {
            galleryReplaceTarget = item.imageId;
            galleryReplaceInput.click();
          });

          // A VIDEO WORK (2026-09-23). The picture in this row is its
          // poster, so "Replace image" means replacing THAT — same queue,
          // same mechanics, and the server carries the video over to the
          // new record. Once the poster is the member's own, the
          // platform's can come back without asking YouTube again.
          const badge = row.querySelector<HTMLElement>("[data-gallery-video-badge]");
          const badgeName = row.querySelector<HTMLElement>("[data-gallery-video-name]");
          const autoThumb = row.querySelector<HTMLButtonElement>("[data-gallery-auto-thumb]");
          if (item.embed) {
            // The same ↻ on the picture as every image row (2026-09-24,
            // Josh: "replace thumbnail needs to get the same icons as the
            // images for replacing") — this used to write the words into
            // the button, which wiped the icon. Only the name says what it
            // replaces here: the poster, not the video.
            named(replace, s["profile.embed.replaceThumb"]).title = s["profile.embed.replaceThumb"];
            if (badge && badgeName) {
              badge.hidden = false;
              badgeName.textContent = s["profile.embed.badge"].replace("{provider}", providerName(item.embed.provider));
            }
            if (autoThumb && item.posterSource === "member") {
              autoThumb.hidden = false;
              autoThumb.textContent = s["profile.embed.autoThumb"];
              autoThumb.dataset.imageId = item.imageId;
              autoThumb.addEventListener("click", () => void restoreGalleryThumbnail(item.imageId, autoThumb));
            }
          }

          // A template is cloned once per image, so its tips cannot carry
          // ids of their own; each row gets its note ids here and its
          // buttons are pointed at them (2026-09-23). An open tip closes on
          // re-render — acceptable, since re-renders happen on
          // upload/remove/reorder, not while typing.
          row.querySelectorAll<HTMLElement>("[data-tip-note]").forEach((note) => {
            const key = note.dataset.tipNote ?? "";
            note.id = `gallery-${index}-note-${key}`;
            const button = row.querySelector<HTMLButtonElement>(`[data-infotip-for="${key}"]`);
            button?.setAttribute("aria-controls", note.id);
            row
              .querySelector<HTMLElement>(`[data-gallery-field="${key}"]`)
              ?.setAttribute("aria-describedby", note.id);
          });
          // The titles, the same way: a clone cannot carry ids, so each
          // control gets one here and its <label> is pointed at it — which
          // is what makes a click on the title focus the field.
          row.querySelectorAll<HTMLLabelElement>("label[data-row-label]").forEach((label) => {
            const key = label.dataset.rowLabel ?? "";
            const control = row.querySelector<HTMLElement>(`[data-gallery-field="${key}"]`);
            if (!control) return;
            control.id = `gallery-${index}-field-${key}`;
            label.htmlFor = control.id;
          });

          // Read back by the focus hint below; the rows are otherwise
          // anonymous once they are in the DOM.
          row.dataset.galleryIndex = String(index);
          row.dataset.imageId = item.imageId;
          return row;
    };
    const buildBlock = (block: Extract<EditorBlock, { kind: "project" }>): HTMLElement | null => {
      const project = projects.find((p) => p.projectId === block.projectId);
      const el = galleryProjectTpl.content.firstElementChild?.cloneNode(true);
      if (!project || !(el instanceof HTMLElement)) return null;
      el.dataset.projectId = project.projectId;
      const name = el.querySelector<HTMLElement>("[data-project-name]");
      const images = el.querySelector<HTMLElement>("[data-project-images]");
      const head = el.querySelector<HTMLElement>(":scope > .gallery-project-head");
      const headUp = head?.querySelector<HTMLButtonElement>('[data-project-move="up"]');
      const headDown = head?.querySelector<HTMLButtonElement>('[data-project-move="down"]');
      const headDelete = head?.querySelector<HTMLButtonElement>("[data-project-delete]");
      const langBtns = Array.from(el.querySelectorAll<HTMLButtonElement>("[data-gallery-lang-btn]"));
      const paneEn = el.querySelector<HTMLElement>('[data-gallery-lang-pane="en"]');
      const paneDe = el.querySelector<HTMLElement>('[data-gallery-lang-pane="de"]');
      if (!name || !images || !headUp || !headDown || !headDelete || langBtns.length !== 2 || !paneEn || !paneDe) return null;

      const setName = () => {
        name.textContent = projectLabel(projects, project.projectId, lang, s["profile.project.untitled"]);
      };
      setName();

      // The block's words fold (2026-09-25), exactly like a work's Details.
      // Queried before the rows are appended, so this cannot reach theirs.
      const detailsFold = el.querySelector<HTMLDetailsElement>(".gallery-project-details");
      if (detailsFold) {
        detailsFold.open = projectDetailsOpenUI.get(project.projectId) ?? false;
        detailsFold.addEventListener("toggle", () => projectDetailsOpenUI.set(project.projectId, detailsFold.open));
      }

      // The header's ↑/↓ move the whole block past its neighbour. Delete
      // ungroups in place — the images stay, as its tooltip says; the
      // document itself goes at Save.
      const id = project.projectId;
      const wireHeadMove = (button: HTMLButtonElement, delta: -1 | 1, control: "up" | "down") => {
        const next = moveProject(blocks, id, delta);
        const label = s[delta < 0 ? "profile.project.moveUp" : "profile.project.moveDown"];
        named(button, label).title = label;
        button.disabled = next === null;
        button.addEventListener("click", () => void applyBlockMove(next, { projectId: id, control }));
      };
      wireHeadMove(headUp, -1, "up");
      wireHeadMove(headDown, 1, "down");
      headDelete.title = s["profile.project.deleteNote"];
      headDelete.addEventListener("click", () => deleteProject(id));

      // Same switch as the rows', keyed by projectId (see galleryLangUI).
      const setProjectLang = (paneLang: "en" | "de") => {
        projectLangUI.set(project.projectId, paneLang);
        langBtns.forEach((btn) => {
          const active = btn.dataset.galleryLangBtn === paneLang;
          btn.classList.toggle("is-active", active);
          btn.setAttribute("aria-pressed", String(active));
        });
        paneEn.hidden = paneLang !== "en";
        paneDe.hidden = paneLang !== "de";
      };
      langBtns.forEach((btn) => {
        const btnLang = btn.dataset.galleryLangBtn === "de" ? "de" : "en";
        named(btn, s[`profile.gallery.lang.${btnLang}`]);
        btn.addEventListener("click", () => setProjectLang(btnLang));
      });
      setProjectLang(projectLangUI.get(project.projectId) ?? "en");

      // Field wiring follows the rows': `.value` from state, `input` writes
      // back into `projects` and reaches the preview. The header re-reads
      // the title as it is typed, so the block is named while it is named.
      type TextKey = "title" | "titleDe" | "description" | "descriptionDe" | "link";
      const wire = (key: TextKey, max: number, labelKey: string, phKey: string) => {
        const input = el.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-project-field="${key}"]`);
        if (!input) return;
        input.value = project[key] ?? "";
        input.maxLength = max;
        input.placeholder = s[phKey];
        named(input, s[labelKey]);
        input.addEventListener("input", () => {
          const value = input.value;
          if (value.trim()) project[key] = value;
          else delete project[key];
          if (key === "title" || key === "titleDe") setName();
          syncPreview();
        });
      };
      wire("title", MAX_PROJECT_TITLE, "profile.project.title.label", "profile.project.title.ph");
      wire("titleDe", MAX_PROJECT_TITLE, "profile.project.title.de", "profile.project.title.de.ph");
      wire("description", MAX_PROJECT_DESCRIPTION, "profile.project.description.label", "profile.project.description.ph");
      wire("descriptionDe", MAX_PROJECT_DESCRIPTION, "profile.project.description.de", "profile.project.description.de.ph");
      wire("link", MAX_PROJECT_LINK, "profile.project.website", "profile.project.website.ph");

      // AFFILIATIONS: rows re-rendered inside the block on add/remove, like
      // the Social Media editor; a mode switch or typing edits in place.
      const affList = el.querySelector<HTMLElement>("[data-affiliations]");
      const affAdd = el.querySelector<HTMLButtonElement>("[data-aff-add]");
      if (affList && affAdd) {
        const renderAffiliations = () => {
          affList.replaceChildren(
            ...project.affiliations
              .map((a, k) => buildAffiliationRow(project, k, a, renderAffiliations))
              .filter((n): n is HTMLElement => n !== null),
          );
          affAdd.disabled = project.affiliations.length >= MAX_AFFILIATIONS;
        };
        affAdd.addEventListener("click", () => {
          if (project.affiliations.length >= MAX_AFFILIATIONS) return;
          project.affiliations.push({ mode: "name", name: "" });
          renderAffiliations();
          affList.querySelector<HTMLInputElement>(`[data-aff-index="${project.affiliations.length - 1}"] [data-aff-field="name"]`)?.focus();
        });
        renderAffiliations();
      }

      // TAGS (2026-09-27), wired like a work row's: `.value` from state, a
      // change writes back (deleted, never stored empty) and reaches the
      // preview. Queried before the rows are appended, so this finds the
      // block's own selector and never one of its works'.
      const projectTags = el.querySelector<HTMLElement & { value: string[] }>(".gallery-project-tags tag-selector");
      const projectTagsFold = el.querySelector<HTMLDetailsElement>(".gallery-project-tags");
      const projectTagsCount = el.querySelector<HTMLElement>("[data-project-tags-count]");
      if (projectTags && projectTagsFold && projectTagsCount) {
        const setCount = (tags: readonly string[]) => {
          projectTagsCount.textContent = tags.length ? `(${tags.length})` : "";
        };
        projectTags.value = project.tags ?? [];
        setCount(project.tags ?? []);
        named(projectTags, s["profile.label.tags"]);
        projectTagsFold.open = projectTagsOpenUI.get(project.projectId) ?? true;
        projectTagsFold.addEventListener("toggle", () => projectTagsOpenUI.set(project.projectId, projectTagsFold.open));
        projectTags.addEventListener("change", () => {
          const tags = projectTags.value;
          if (tags.length) project.tags = tags;
          else delete project.tags;
          setCount(tags);
          syncPreview();
        });
      }

      // The block's own tips get their ids here, like the rows' — and
      // BEFORE the rows are appended, so this query cannot reach theirs.
      el.querySelectorAll<HTMLElement>("[data-tip-note]").forEach((note) => {
        const key = note.dataset.tipNote ?? "";
        note.id = `project-${project.projectId}-note-${key}`;
        el.querySelector<HTMLButtonElement>(`[data-infotip-for="${key}"]`)?.setAttribute("aria-controls", note.id);
        el.querySelector<HTMLElement>(`[data-project-field="${key}"]`)?.setAttribute("aria-describedby", note.id);
      });
      el.querySelectorAll<HTMLLabelElement>("label[data-row-label]").forEach((label) => {
        const key = label.dataset.rowLabel ?? "";
        const control = el.querySelector<HTMLElement>(`[data-project-field="${key}"]`);
        if (!control) return;
        control.id = `project-${project.projectId}-field-${key}`;
        label.htmlFor = control.id;
      });

      images.append(...block.indices.map(buildRow).filter((n): n is HTMLElement => n !== null));
      const emptyNote = el.querySelector<HTMLElement>("[data-project-empty]");
      if (emptyNote) emptyNote.hidden = block.indices.length > 0;

      const picker = el.querySelector<HTMLInputElement>("[data-project-files]");
      picker?.addEventListener("change", () => {
        addGalleryFiles(Array.from(picker.files ?? []), { projectId: project.projectId });
        picker.value = "";
      });
      return el;
    };
    galleryEditor.replaceChildren(
      ...blocks
        .map((block) => (block.kind === "image" ? buildRow(block.index) : buildBlock(block)))
        .filter((n): n is HTMLElement => n !== null),
    );
    // Pending uploads into a block were unhomed by replaceChildren above.
    renderQueue();
    // The image-led directory renders a typographic card for an empty
    // gallery; the nudge says so, and disappears with the first image.
    const nudge = document.getElementById("gallery-nudge");
    if (nudge) nudge.hidden = gallery.length > 0;
    updateGalleryControls();
    if (focusHint) {
      // Back onto the control that was just used, in the row or header it
      // moved with. An arrow that is now disabled (the row reached the
      // edge) cannot take focus, so its twin does.
      const pick = (root: Element | null, up: string, down: string, control: "up" | "down") => {
        const [first, second] = control === "up" ? [up, down] : [down, up];
        const a = root?.querySelector<HTMLButtonElement>(first);
        return a && !a.disabled ? a : root?.querySelector<HTMLButtonElement>(second);
      };
      let target: HTMLElement | null | undefined;
      if ("imageId" in focusHint) {
        const row = galleryEditor.querySelector<HTMLElement>(`[data-image-id="${focusHint.imageId}"]`);
        target =
          focusHint.control === "project"
            ? row?.querySelector<HTMLElement>("[data-gallery-project]")
            : pick(row, '[data-gallery-move="up"]', '[data-gallery-move="down"]', focusHint.control);
      } else {
        const block = galleryEditor.querySelector<HTMLElement>(`[data-project-id="${focusHint.projectId}"]`);
        target = focusHint.field
          ? block?.querySelector<HTMLElement>(`[data-project-field="${focusHint.field}"]`)
          : pick(
              block?.querySelector(":scope > .gallery-project-head") ?? null,
              '[data-project-move="up"]',
              '[data-project-move="down"]',
              focusHint.control ?? "up",
            );
      }
      target?.focus();
    } else if (typingIn?.field && (typingIn.imageId || typingIn.projectId)) {
      // Restored by id, stable across everything a re-render can do to
      // positions. A reorder takes the branch above instead, and a removal
      // was a button press rather than a caret. A row's field first: a row
      // inside a block matches both ids, and its own is the nearer.
      const back = galleryEditor.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        typingIn.imageId
          ? `[data-image-id="${typingIn.imageId}"] [data-gallery-field="${typingIn.field}"]`
          : typingIn.affIndex !== undefined
            ? `[data-project-id="${typingIn.projectId}"] [data-aff-index="${typingIn.affIndex}"] [data-aff-field="${typingIn.field}"]`
            : `[data-project-id="${typingIn.projectId}"] [data-project-field="${typingIn.field}"]`,
      );
      if (back) {
        back.focus();
        if (typingIn.start !== null && typingIn.end !== null) {
          back.setSelectionRange(typingIn.start, typingIn.end);
        }
      }
    }
    // The gallery IS the profile page's content AND the card's artwork, so
    // every add, removal and reorder has to reach both previews. This is
    // the one place the gallery re-renders, which makes it the one place
    // that needs to say so.
    syncPreview();
  }

  /**
   * The cap, stated by the control instead of by an error message.
   *
   * The limit used to be enforced halfway through a batch: pick ten files,
   * watch as many as fitted upload, then read "Gallery is full" while the
   * rest were silently abandoned. Counting queued-but-unfinished uploads as
   * occupied means the button is already unavailable before that can happen.
   *
   * Two ceilings wear the same shape here — the real one, and the one an
   * unverified account sits under until it clicks the link — so the note
   * beside the disabled button has to say WHICH, or "gallery is full" is a
   * lie to somebody holding one image.
   */
  let galleryCapNote = "";

  function updateGalleryControls() {
    const limit = galleryLimit(auth.currentUser);
    const full = gallery.length + galleryQueue.pendingCount() + videoPending >= limit;
    galleryAdd.setAttribute("aria-disabled", String(full));
    galleryInput.disabled = full;
    // The blocks' own pickers share the cap: an image is an image wherever
    // it is added.
    for (const picker of galleryEditor.querySelectorAll<HTMLInputElement>("[data-project-files]")) {
      picker.disabled = full;
      picker.closest(".gallery-project-add")?.setAttribute("aria-disabled", String(full));
    }
    // Here rather than in renderGallery: this runs on every queue change
    // too, and a row's Replace must come back when its upload ends without
    // rebuilding the rows (and the caret) under the member.
    for (const button of galleryEditor.querySelectorAll<HTMLButtonElement>("[data-gallery-replace], [data-gallery-auto-thumb]")) {
      const id = button.dataset.imageId ?? "";
      button.disabled = galleryQueue.replacing(id) || restoringThumbs.has(id);
    }
    // The video field shares the cap: a link is a work. Its opener stays
    // pressable while a link is on its way, so the panel can be closed.
    galleryVideoAdd.disabled = full || videoPending > 0;
    galleryVideoUrl.disabled = full;
    galleryVideoOpen.disabled = full && galleryVideoPanel.hidden;

    const capNote = full
      ? limit < MAX_GALLERY_IMAGES
        ? s["profile.gallery.verifyForMore"]
        : s["profile.gallery.full"]
      : "";
    if (capNote !== galleryCapNote) {
      // The line is taken over only when it is free or still showing this
      // function's own last note. A per-file error from the queue is more
      // specific than the cap and outranks it; and clearing on the way back
      // down is what stops "gallery is full" standing over a gallery that a
      // removal has just made room in.
      if (!galleryStatus.textContent || galleryStatus.textContent === galleryCapNote) {
        setGalleryStatus(capNote);
      }
      galleryCapNote = capNote;
    }
  }

  /**
   * Live rows for the queue, keyed by task id.
   *
   * Reconciled rather than re-rendered: a progress event arrives several
   * times a second per upload, and replaceChildren() on every one of them
   * would rebuild rows under the member's pointer and re-run the image decode
   * for each thumbnail.
   */
  const galleryTaskRows = new Map<string, HTMLElement>();

  function renderQueue() {
    if (!galleryTaskTpl) return;
    const tasks = galleryQueue.tasks();
    const live = new Set(tasks.map((task) => task.id));
    for (const [id, row] of galleryTaskRows) {
      if (live.has(id)) continue;
      row.remove();
      galleryTaskRows.delete(id);
    }
    for (const task of tasks) {
      let row = galleryTaskRows.get(task.id);
      if (!row) {
        const clone = galleryTaskTpl.content.firstElementChild?.cloneNode(true);
        if (!(clone instanceof HTMLElement)) continue;
        row = clone;
        galleryTaskRows.set(task.id, row);
        buildTaskRow(row, task);
      }
      // Where the row lives: inside the block it was added to, if that
      // block is on screen, else the queue below the list. Re-homed on
      // every pass because renderGallery() rebuilds the blocks — the row
      // survives (this map holds it) and is simply appended again.
      const home =
        (task.projectId && galleryEditor.querySelector<HTMLElement>(`[data-project-id="${task.projectId}"] [data-project-images]`)) ||
        galleryQueueEl;
      if (row.parentElement !== home) home.appendChild(row);
      paintTaskRow(row, task);
    }
    updateGalleryControls();
  }

  /** The parts of a queue row that never change: its thumbnail and its buttons. */
  function buildTaskRow(row: HTMLElement, task: GalleryTask) {
    const img = row.querySelector<HTMLImageElement>("[data-task-img]");
    const name = row.querySelector<HTMLElement>("[data-task-name]");
    const cancel = row.querySelector<HTMLButtonElement>("[data-task-cancel]");
    const retry = row.querySelector<HTMLButtonElement>("[data-task-retry]");
    const dismiss = row.querySelector<HTMLButtonElement>("[data-task-dismiss]");
    // The local bytes, so the image is on screen before the upload starts.
    // This is the whole of the optimistic UI: the member sees what they
    // picked and where it will sit, immediately.
    if (img) img.src = task.thumbUrl;
    if (name) {
      name.textContent = task.replaces
        ? s["profile.gallery.replacing"].replace("{name}", task.name)
        : task.name;
    }
    if (cancel) {
      named(cancel, s["profile.gallery.cancel"]);
      cancel.addEventListener("click", () => galleryQueue.cancel(task.id));
    }
    if (retry) {
      retry.textContent = s["profile.gallery.retry"];
      retry.addEventListener("click", () => galleryQueue.retry(task.id));
    }
    if (dismiss) {
      dismiss.textContent = s["profile.gallery.dismiss"];
      dismiss.addEventListener("click", () => galleryQueue.dismiss(task.id));
    }
  }

  /** The parts that change: state wording, the bar, and which buttons apply. */
  function paintTaskRow(row: HTMLElement, task: GalleryTask) {
    const bar = row.querySelector<HTMLElement>("[data-task-bar]");
    const track = row.querySelector<HTMLElement>("[data-task-track]");
    const state = row.querySelector<HTMLElement>("[data-task-state]");
    const tools = row.querySelector<HTMLElement>("[data-task-tools]");
    const cancel = row.querySelector<HTMLButtonElement>("[data-task-cancel]");
    const retry = row.querySelector<HTMLButtonElement>("[data-task-retry]");
    const failed = task.state === "error";

    row.classList.toggle("has-error", failed);
    row.classList.toggle("is-waiting", task.state === "queued" || task.state === "preparing");
    if (bar) bar.style.width = `${task.state === "uploading" ? task.progress : 0}%`;
    // On the track, not read aloud as it changes: a progressbar is polled by
    // the screen reader when the member asks for it.
    if (track) track.setAttribute("aria-valuenow", String(task.progress));
    if (state) {
      // A failure is the one thing worth interrupting for, and it is the one
      // thing that stops changing once it has happened.
      state.setAttribute("role", failed ? "alert" : "presentation");
      // Per file, in words, in the member's language. "Uploading 40%" on a
      // shared line could never say WHICH of six files was at 40%.
      state.textContent = failed
        ? s[galleryErrorKey(task.error ?? "unknown")]
        : task.state === "uploading"
          ? `${s["profile.upload.uploading"]} ${task.progress}%`
          : task.state === "preparing"
            ? s["profile.gallery.preparing"]
            : s["profile.gallery.queued"];
    }
    // Cancel belongs to work in progress; Retry and Dismiss belong to work
    // that stopped. Showing all three at once would offer to cancel a file
    // that already failed.
    if (cancel) cancel.hidden = failed;
    if (tools) tools.hidden = !failed;
    // Retry is only offered where trying again could actually differ. An SVG
    // will still be an SVG; a dropped connection may well be back.
    if (retry) retry.hidden = !failed || !isRetryable(task.error ?? "unknown");
  }

  /**
   * Uploads, removals and reorders persist immediately, because they own
   * files in Storage — the Firestore array is what says which of those files
   * still belong to the member.
   *
   * Only the ids go: since 2026-09-07 the array is the order and nothing
   * else. Typed text belongs to Save, which writes it onto the records.
   */
  async function persistGallery() {
    const user = auth.currentUser;
    if (!user) return;
    await updateUserProfile(user.uid, {
      gallery: galleryIds(gallery),
      updatedAt: new Date(),
    });
  }

  let galleryWrite: Promise<boolean> | null = null;
  let galleryWriteAgain = false;

  /**
   * Writes the array now, and folds callers that arrive mid-write into one
   * further pass afterwards.
   *
   * This is what closes the orphan window. The old flow persisted ONCE at the
   * end of the batch, so a member who closed the tab after four of six
   * uploads left four images whose records said `live` but which the
   * member's own gallery array never mentioned. Writing per completion
   * removes that window; coalescing keeps six completions from becoming six
   * overlapping writes racing each other to be last.
   *
   * A caller that arrives mid-write gets the IN-FLIGHT promise rather than an
   * early answer, and that matters: `gallery` is one shared array, so the
   * extra pass this caller just requested carries its change too, and the
   * promise it is waiting on does not resolve until that pass is done. An
   * early `false` would have been the orphan bug wearing different clothes —
   * the caller would skip its deletion mark for a write that in fact
   * succeeded, leaving the record `live` and unreferenced for good.
   *
   * Returns whether the array is safely stored, which callers that go on to
   * RETIRE an image must check: marking a record for deletion while the
   * stored array still points at it is how a gallery gets a permanent broken
   * image.
   */
  function persistGalleryNow(): Promise<boolean> {
    if (galleryWrite) {
      galleryWriteAgain = true;
      return galleryWrite;
    }
    galleryWrite = (async () => {
      try {
        do {
          galleryWriteAgain = false;
          await persistGallery();
        } while (galleryWriteAgain);
        setGalleryStatus("");
        return true;
      } catch (error) {
        setGalleryStatus(s[galleryErrorKey(galleryErrorCode(error))]);
        return false;
      } finally {
        galleryWrite = null;
      }
    })();
    return galleryWrite;
  }

  /**
   * One image finished uploading: it joins the gallery and the array is
   * stored. At the end, or — for an upload into a project — directly after
   * that project's last image, inside its block (2026-09-23).
   */
  async function onGalleryUploaded(item: GalleryItem) {
    // `projects` passed so an upload into a block deleted meanwhile arrives
    // loose instead of carrying a dangling projectId onto its record.
    gallery = insertUploaded(gallery, item, projects);
    // A new work is the one about to be written, so its row arrives open.
    galleryDetailsOpenUI.set(item.imageId, true);
    renderGallery();
    await persistGalleryNow();
  }

  /**
   * A work's new picture is live: the row keeps everything the member wrote
   * and takes the new image. Same order as a removal — the array stops
   * pointing at the old record BEFORE that record is marked, or the gallery
   * would briefly hold a broken image.
   */
  async function onGalleryReplaced(item: GalleryItem, replaced: string) {
    const index = gallery.findIndex((work) => work.imageId === replaced);
    if (index === -1) {
      // The work was removed while its new picture uploaded. Nothing points
      // at the new record, so it goes now instead of lingering live and
      // unreferenced. (For the unverified slot this is the same record,
      // which completion had just brought back to life.)
      await markImageForDeletion(item.imageId).catch(() => {});
      return;
    }
    const inPlace = item.imageId === replaced;
    // Same work, new record id: the fold stays as the member left it.
    if (!inPlace) galleryDetailsOpenUI.set(item.imageId, galleryDetailsOpenUI.get(replaced) ?? false);
    gallery[index] = {
      ...gallery[index],
      imageId: item.imageId,
      // The unverified slot keeps its storage path, so its URL string does
      // not change and the browser would show the cached old picture. This
      // tag is for the editor only — only ids are ever stored.
      url: inPlace ? `${item.url}&v=${Date.now()}` : item.url,
      width: item.width,
      height: item.height,
      color: item.color,
      // A video work's poster: an upload is the member's own, a restore is
      // the platform's. The embed itself rides on the spread above.
      ...(gallery[index].embed ? { posterSource: item.posterSource ?? "member" } : {}),
    };
    renderGallery();
    syncPreview();
    if (inPlace) return;
    if (await persistGalleryNow()) await markImageForDeletion(replaced).catch(() => {});
  }

  async function removeGalleryImage(index: number) {
    const [removed] = gallery.splice(index, 1);
    // A new picture on its way to this work has nowhere to land any more.
    for (const task of galleryQueue.tasks()) {
      if (removed && task.replaces === removed.imageId) galleryQueue.cancel(task.id);
    }
    renderGallery();
    // The record is marked only once Firestore has stopped pointing at it.
    if ((await persistGalleryNow()) && removed) {
      await markImageForDeletion(removed.imageId);
    }
  }

  /**
   * Moves one image, and stores the new order straight away.
   *
   * Order is not a preference the member might still be deciding — it decides
   * which image is the card's cover, so leaving it until Save would leave the
   * editor and the directory disagreeing about the card.
   */
  /**
   * One affiliation row. Name mode: a name and an optional link, stored
   * scheme-less like every link here. Member mode: the type-ahead over the
   * directory's names; the credit is real only once the typed name IS a
   * member's (memberUid set), and the note under the field says so while
   * it is not — affiliationRecords() drops an unmatched Member row rather
   * than saving a name nobody chose. A new credit's slug is fetched so the
   * preview can link it at once.
   */
  function buildAffiliationRow(
    project: EditorProject,
    k: number,
    a: EditorAffiliation,
    rerender: () => void,
  ): HTMLElement | null {
    const row = galleryAffiliationTpl?.content.firstElementChild?.cloneNode(true);
    if (!(row instanceof HTMLElement)) return null;
    row.dataset.affIndex = String(k);
    const modeBtns = Array.from(row.querySelectorAll<HTMLButtonElement>("[data-aff-mode]"));
    const paneName = row.querySelector<HTMLElement>('[data-aff-pane="name"]');
    const paneMember = row.querySelector<HTMLElement>('[data-aff-pane="member"]');
    const nameInput = row.querySelector<HTMLInputElement>('[data-aff-field="name"]');
    const urlInput = row.querySelector<HTMLInputElement>('[data-aff-field="url"]');
    const memberInput = row.querySelector<HTMLInputElement>('[data-aff-field="member"]');
    const noMatch = row.querySelector<HTMLElement>(".gallery-aff-nomatch");
    const remove = row.querySelector<HTMLButtonElement>("[data-aff-remove]");
    if (!paneName || !paneMember || !nameInput || !urlInput || !memberInput || !noMatch || !remove) return null;

    const setMode = (mode: "name" | "member") => {
      a.mode = mode;
      // One name, two inputs: the text typed in one mode is the row's
      // name in the other too, so it travels across the switch.
      (mode === "member" ? memberInput : nameInput).value = a.name;
      modeBtns.forEach((btn) => {
        const active = btn.dataset.affMode === mode;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-pressed", String(active));
      });
      paneName.hidden = mode !== "name";
      paneMember.hidden = mode !== "member";
      // A row switched to Member with a name typed in Name mode may already
      // spell a member; a row that has its member keeps it (memberUidFor).
      if (mode === "member") void ensureMemberOptions().then(resolveMember);
      syncPreview();
    };
    modeBtns.forEach((btn) =>
      btn.addEventListener("click", () => {
        const mode = btn.dataset.affMode === "member" ? "member" : "name";
        if (mode !== a.mode) setMode(mode);
        (mode === "member" ? memberInput : nameInput).focus();
      }),
    );

    nameInput.value = a.name;
    nameInput.maxLength = MAX_AFFILIATION_NAME;
    nameInput.placeholder = s["profile.project.affiliation.namePh"];
    named(nameInput, s["profile.project.affiliation.name"]);
    nameInput.addEventListener("input", () => {
      a.name = nameInput.value;
      syncPreview();
    });

    urlInput.value = a.url ?? "";
    urlInput.maxLength = MAX_AFFILIATION_URL;
    urlInput.placeholder = s["profile.project.link"];
    named(urlInput, s["profile.project.link"]);
    urlInput.addEventListener("input", () => {
      const value = urlInput.value.trim();
      if (value) a.url = value;
      else delete a.url;
      syncPreview();
    });

    // Resolve on TYPING only. A focus or a mode switch re-paints the note
    // from state and touches no credit: memberUidFor() keeps the stored
    // member while the text is still the stored name, so a credit to a
    // member who has since hidden their profile stays (plain text on the
    // page), and a namesake cannot take it over on a focus.
    const paintMember = () => {
      memberInput.dataset.uid = a.memberUid ?? "";
      noMatch.hidden = !memberInput.value.trim() || !memberOptions || Boolean(a.memberUid);
    };
    const resolveMember = () => {
      const uid = memberUidFor(memberInput.value, memberOptions, a);
      a.name = memberInput.value;
      a.memberUid = uid;
      paintMember();
      if (uid && !previewSlugs.has(uid)) {
        void memberSlugs([uid])
          .then((slugs) => {
            for (const [id, slug] of slugs) previewSlugs.set(id, slug);
            syncPreview();
          })
          .catch(() => {});
      }
    };
    memberInput.value = a.name;
    memberInput.maxLength = MAX_AFFILIATION_NAME;
    memberInput.placeholder = s["profile.project.affiliation.memberPh"];
    named(memberInput, s["profile.project.affiliation.member"]);
    paintMember();
    memberInput.addEventListener("focus", () => void ensureMemberOptions().then(paintMember));
    memberInput.addEventListener("input", () => {
      resolveMember();
      syncPreview();
    });

    remove.setAttribute("aria-label", s["profile.project.affiliation.remove"]);
    remove.addEventListener("click", () => {
      project.affiliations.splice(k, 1);
      rerender();
      syncPreview();
    });

    // Mode from state without the side effects of a click (no focus, no
    // preview sync — the block's render syncs once).
    modeBtns.forEach((btn) => {
      const active = btn.dataset.affMode === a.mode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
    paneName.hidden = a.mode !== "name";
    paneMember.hidden = a.mode !== "member";
    return row;
  }

  /** "+ New project": an empty block at the end, its title ready to type into. Local until an image names it. */
  function newProject() {
    const projectId = crypto.randomUUID();
    projects.push({ projectId, affiliations: [] });
    // Open: its title is where focus goes, and it is the block about to be filled in.
    projectDetailsOpenUI.set(projectId, true);
    renderGallery({ projectId, field: "title" });
  }
  galleryNewProject.addEventListener("click", newProject);

  /**
   * "Delete project": the block dissolves where it stands and its images stay
   * as loose rows, so the gallery's order does not change and nothing is
   * stored now. The document is deleted at Save — `deletedProjectIds` is how
   * Save still knows about a project no longer in `projects`.
   */
  function deleteProject(projectId: string) {
    const blocks = editorBlocks(gallery, projects);
    const first = gallery.find((g) => g.projectId === projectId);
    gallery = applyBlocks(gallery, dissolveProject(blocks, projectId));
    projects = projects.filter((p) => p.projectId !== projectId);
    projectLangUI.delete(projectId);
    projectDetailsOpenUI.delete(projectId);
    if (storedProjectIds.has(projectId)) deletedProjectIds.add(projectId);
    renderGallery(first ? { imageId: first.imageId, control: "up" } : undefined);
    // A lone image has both arrows disabled, and nothing else to land on.
    if (!galleryEditor.contains(document.activeElement)) galleryNewProject.focus();
  }

  async function applyBlockMove(next: EditorBlock[] | null, focusHint?: FocusHint) {
    // Null is the pure function saying the move changes nothing visible
    // (an edge, or the invisible edge before the empty blocks) — see
    // moveBlock() in projectEditor.ts. The button is disabled then; this
    // guards the keyboard path that reaches a stale handler anyway.
    if (!next) return;
    const before = gallery;
    gallery = applyBlocks(gallery, next);
    // The blocks' order is also the `projects` order — the only order an
    // EMPTY block has, since it anchors to no image.
    projects = orderProjects(projects, next.flatMap((b) => (b.kind === "project" ? [b.projectId] : [])));
    renderGallery(focusHint);
    // Membership (projectId) follows Save; the ORDER is stored at once, as
    // before. A move that only changed membership — into a project at the
    // same place — has nothing to store yet.
    if (!sameIds(before, gallery)) await persistGalleryNow();
  }

  /**
   * The one way files enter the queue, from the picker or from a drop.
   *
   * Rejections are reported per file and named per cause, all at once for the
   * whole selection — the old loop overwrote one shared line per file, so a
   * six-file batch ended showing only whatever happened to the last one.
   */
  function addGalleryFiles(files: File[], target?: { projectId: string }) {
    if (files.length === 0) return;
    const limit = galleryLimit(auth.currentUser);
    const outcome = galleryQueue.add(files, target);
    const problems = outcome.rejected.map(
      (rejection) => `${rejection.name}: ${s[galleryErrorKey(rejection.code)]}`,
    );
    if (outcome.overflow > 0) {
      // The member's OWN ceiling in the sentence: an unverified account is
      // told it fits one, and told separately why.
      problems.push(
        s["profile.gallery.overflow"]
          .replace("{n}", String(limit))
          .replace("{m}", String(outcome.overflow)),
      );
      if (limit < MAX_GALLERY_IMAGES) problems.push(s["profile.gallery.verifyForMore"]);
    }
    setGalleryStatus(problems.join(" · "));
  }

  // ── Video links (2026-09-23) ──────────────────────────

  function setVideoStatus(text: string) {
    galleryVideoStatus.textContent = text;
    galleryVideoStatus.hidden = !text;
  }

  /** "Add video" opens the link field; Cancel, a second press or a landed link closes it. */
  function setVideoPanel(open: boolean, refocus = true) {
    galleryVideoPanel.hidden = !open;
    galleryVideoOpen.setAttribute("aria-expanded", String(open));
    galleryVideoOpen.classList.toggle("is-open", open);
    if (open) {
      galleryVideoUrl.focus();
    } else {
      setVideoStatus("");
      if (refocus) galleryVideoOpen.focus();
    }
    updateGalleryControls();
  }
  galleryVideoOpen.addEventListener("click", () => setVideoPanel(galleryVideoPanel.hidden));
  galleryVideoCancel.addEventListener("click", () => {
    galleryVideoUrl.value = "";
    setVideoPanel(false);
  });

  async function addGalleryVideo() {
    const url = galleryVideoUrl.value.trim();
    if (!url || videoPending > 0) return;
    if (gallery.length + galleryQueue.pendingCount() >= galleryLimit(auth.currentUser)) {
      setVideoStatus(s["profile.embed.err.full"]);
      return;
    }
    // Counted BEFORE the first await: the claim check below can refresh the
    // token over the network, and a double press in that gap would
    // otherwise ask the server for two works.
    videoPending += 1;
    setVideoStatus("");
    galleryVideoAdd.textContent = s["profile.embed.adding"];
    updateGalleryControls();
    try {
      // Asked of the TOKEN, like every upload (see uploadImage): the server
      // reads the claim, and a just-verified account's cached record says
      // true before its token does.
      if (!auth.currentUser || !(await hasVerifiedClaim(auth.currentUser))) {
        setVideoStatus(s["profile.embed.err.verify"]);
        return;
      }
      const item = await addVideoLink(url);
      galleryVideoUrl.value = "";
      setVideoPanel(false, false);
      await onGalleryUploaded(item);
    } catch (error) {
      setVideoStatus(s[`profile.embed.err.${embedErrorCode(error)}`]);
    } finally {
      videoPending -= 1;
      galleryVideoAdd.textContent = s["profile.embed.submit"];
      updateGalleryControls();
    }
  }
  galleryVideoAdd.addEventListener("click", () => void addGalleryVideo());
  galleryVideoUrl.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !event.isComposing) {
      event.preventDefault();
      setVideoPanel(false);
      return;
    }
    if (event.key !== "Enter" || event.isComposing) return;
    // Enter in a text field submits the enclosing form — here, the profile.
    event.preventDefault();
    void addGalleryVideo();
  });

  /** "Use automatic thumbnail": the platform's poster comes back as a new record, swapped in like a replacement. */
  async function restoreGalleryThumbnail(imageId: string, button: HTMLButtonElement) {
    if (restoringThumbs.has(imageId)) return;
    restoringThumbs.add(imageId);
    button.disabled = true;
    try {
      const item = await restoreAutoThumbnail(imageId);
      await onGalleryReplaced(item, imageId);
    } catch (error) {
      setGalleryStatus(s[`profile.embed.err.${embedErrorCode(error)}`]);
    } finally {
      restoringThumbs.delete(imageId);
      updateGalleryControls();
    }
  }

  galleryReplaceInput.addEventListener("change", () => {
    const file = galleryReplaceInput.files?.[0];
    // Cleared for the same reason as the main picker's: the same file
    // picked twice fires no second change event.
    galleryReplaceInput.value = "";
    const target = galleryReplaceTarget;
    galleryReplaceTarget = null;
    if (!file || !target) return;
    const outcome = galleryQueue.replace(target, file);
    // "busy" cannot come from the button (it is disabled then), so it has
    // no sentence; everything else is the same per-file wording as an add.
    if (outcome && outcome !== "busy") {
      setGalleryStatus(`${file.name}: ${s[galleryErrorKey(outcome)]}`);
    }
  });

  galleryInput.addEventListener("change", () => {
    const files = Array.from(galleryInput.files ?? []);
    // Cleared straight away: without this, picking the same file again after
    // a failure fires no change event at all.
    galleryInput.value = "";
    addGalleryFiles(files);
  });

  /**
   * Drag-and-drop onto the gallery block.
   *
   * The depth counter is not incidental: dragenter and dragleave fire for
   * every descendant the pointer crosses, so a plain dragleave handler
   * un-highlights the zone the instant the cursor passes over a thumbnail
   * INSIDE it. Counting entries and exits is what makes the highlight track
   * the zone rather than its children.
   */
  let galleryDragDepth = 0;

  function galleryDragHasFiles(event: DragEvent) {
    return Boolean(event.dataTransfer?.types.includes("Files"));
  }

  galleryDrop.addEventListener("dragenter", (event) => {
    if (!galleryDragHasFiles(event)) return;
    event.preventDefault();
    galleryDragDepth += 1;
    galleryDrop.classList.add("is-dragging");
  });

  galleryDrop.addEventListener("dragover", (event) => {
    if (!galleryDragHasFiles(event)) return;
    // Without preventDefault the browser treats the drop as navigation and
    // opens the image file over the top of the form.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  });

  galleryDrop.addEventListener("dragleave", () => {
    galleryDragDepth = Math.max(0, galleryDragDepth - 1);
    if (galleryDragDepth === 0) galleryDrop.classList.remove("is-dragging");
  });

  galleryDrop.addEventListener("drop", (event) => {
    event.preventDefault();
    galleryDragDepth = 0;
    galleryDrop.classList.remove("is-dragging");
    addGalleryFiles(Array.from(event.dataTransfer?.files ?? []));
  });

  function getSelectedPrimaryAudiences() {
    return primaryAudienceInputs.filter((input) => input.checked).map((input) => input.value);
  }

  function setSelectedPrimaryAudiences(value: unknown) {
    const selected = Array.isArray(value) ? value.filter(Boolean).map(String) : [];
    primaryAudienceInputs.forEach((input) => {
      input.checked = selected.includes(input.value);
    });
  }

  function showPreview(url: string) {
    avatarImg.src = url;
    avatarWrap.classList.toggle("has-image", !!url);
    avatarImg.onerror = () => {
      avatarWrap.classList.remove("has-image");
    };
    syncPreview();
  }

  function syncPreview() {
    const cardRoot = document.querySelector<HTMLElement>("[data-ccpv-root]");
    if (cardRoot) {
      renderCardPreview(cardRoot, currentViewModel(), cardPreviewLabels);
    }
    syncProfileView();
  }

  /** Live form state as the one view model every preview consumes. */
  function currentViewModel() {
    const viewProjects = previewProjects(auth.currentUser?.uid ?? "", projects, gallery, previewSlugs);
    const viewProjectById = new Map(viewProjects.map((p) => [p.id, p]));
    return {
      displayName: nameInput.value.trim(),
      // The avatar the member is looking at right now — a saved photoURL, or
      // the object URL of a picture they have not saved yet. `has-image` is the
      // one flag that knows the difference between "no picture" and "a
      // picture that failed to load"; reading .src alone would put a broken
      // portrait into the preview.
      photoURL: avatarWrap.classList.contains("has-image") ? avatarImg.src : "",
      photoColor: avatarColor || undefined,
      // For the tab's own locale, as localizeMember() does for the built
      // pages — a member previewing /de/profile sees the German pair.
      role: profileRole({ role: roleInput.value, roleDe: roleDeInput.value }, lang),
      memberType: memberTypeSelector?.value ?? "",
      bio: profileBio({ bio: bioInput.value, bioDe: bioDeInput.value }, lang),
      tags: tagSelector?.value ?? [],
      openTo: openToSelector?.value ?? [],
      affiliation: affiliationInput.value.trim(),
      location: locationInput.value.trim(),
      languages: getSelectedLanguages(),
      visualNeeds: needsVisuals(memberTypeSelector?.value ?? "")
        ? (visualNeedsSelector?.value ?? [])
        : [],
      portfolio: portfolioInput.value.trim(),
      socialMedia: socialStored(),
      // The projects an image names, credits resolved to the slugs known
      // (2026-09-23) — the build skips an empty project, so the preview
      // must show none for it either.
      projects: viewProjects,
      works: gallery.map((g) => {
        const project = g.projectId ? viewProjectById.get(g.projectId) : undefined;
        return {
          url: g.url,
          width: g.width,
          height: g.height,
          // Both resolved for the tab's OWN locale, same as the built page
          // picks them for its own — see workCaption()/workDescription() in
          // links.ts. A member previewing the German tab sees exactly what
          // a German visitor would: the German field if they wrote one, the
          // field above otherwise.
          caption: workCaption(g, lang),
          color: g.color,
          description: workDescription(g, lang),
          // Same rule the built page applies — works() in memberView.ts calls
          // this too — so the Preview tab shows a link exactly when a visitor
          // would get one, including showing none for a value that is not
          // link-shaped yet, mid-typing.
          link: workLink(g.link),
          // The project's link fills an empty siteLink slot, the image's own
          // wins — the same rule works() in memberView.ts applies.
          siteLink: inheritedSiteLink(workLink(g.siteLink), project),
          tags: g.tags ?? [],
          ...(g.embed ? { embed: g.embed } : {}),
          ...(project ? { projectId: project.id } : {}),
        };
      }),
    };
  }

  /**
   * The profile-page preview. Skipped entirely while the form is in edit
   * mode — it is off-screen there, so re-rendering it on every keystroke
   * would be work nobody can see.
   */
  function syncProfileView() {
    if (!profileViewRoot || !form.classList.contains("is-previewing")) return;
    // `member.openTo`, not `profile.view.openTo`: the shell renders the
    // page's markup, so the words in it have to be the page's words. The two
    // keys read identically today, and that is precisely the kind of
    // agreement that survives only while someone remembers to maintain it.
    renderProfilePreview(profileViewRoot, currentViewModel(), {
      defaultName: s["profile.view.defaultName"],
      openTo: s["member.openTo"],
      noWorks: s["profile.view.noWorks"],
      with: s["member.project.with"],
      lang,
      carousel: {
        prev: s["member.project.prev"],
        next: s["member.project.next"],
        position: s["member.project.position"],
        works: s["member.project.works"],
        roledescription: s["community.card.carousel"],
      },
    });
  }

  /**
   * The hidden-by-choice banner: a verified account whose public profile is
   * not listed. Unverified accounts are told by the amber banner instead.
   * Re-run after every Save so the page agrees with what was just written.
   */
  function syncHiddenBanner(verified: boolean, active: boolean) {
    const banner = document.getElementById("hidden-banner");
    if (banner) banner.style.display = verified && !active ? "block" : "none";
  }
  document.getElementById("btn-hidden-account")?.addEventListener("click", () => {
    setSection("account");
    activeInput.focus();
  });

  function setSection(section: string) {
    formSections.forEach((el) => {
      el.classList.toggle("is-active", el.dataset.section === section);
    });
    sectionTabs.forEach((btn) => {
      const active = btn.dataset.section === section;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", String(active));
      btn.tabIndex = active ? 0 : -1;
    });
    // The preview renders on tab entry, not on every keystroke behind the
    // scenes — syncProfileView's early return keys off this class.
    form.classList.toggle("is-previewing", section === "preview");
    if (section === "preview") syncProfileView();
  }

  /** Scientists and research groups get lab-facing field wording. */
  function syncMemberTypeCopy() {
    const type = memberTypeSelector?.value ?? "";
    const copy = memberTypeFieldCopy(type, (key) => s[key] ?? key);
    nameInput.placeholder = copy.namePlaceholder;
    roleInput.placeholder = copy.rolePlaceholder;
    portfolioInput.placeholder = copy.portfolioPlaceholder;
    if (portfolioLabel) portfolioLabel.textContent = copy.portfolioLabel;
    affiliationInput.placeholder = copy.affiliationPlaceholder;
    socialPlaceholder = copy.socialPlaceholder;
    if (socialLabel) socialLabel.textContent = copy.socialLabel;
    // Reach into the live rows rather than re-rendering them: a member can
    // change their type with a half-typed link on screen.
    socialEditor.querySelectorAll<HTMLInputElement>("[data-social-input]").forEach((input, i) => {
      input.placeholder = socialPlaceholder;
      input.setAttribute("aria-label", `${copy.socialLabel} ${i + 1}`);
    });
    // A creator makes visuals rather than needing them, so the question
    // is hidden for them — and its stored value is dropped on save, so a
    // member who switches type cannot leave orphaned needs behind.
    if (visualNeedsSelector) visualNeedsSelector.hidden = !needsVisuals(type);
  }

  memberTypeSelector?.addEventListener("member-type-change", () => {
    syncMemberTypeCopy();
    // The member type is the typographic card face's tag-line fallback.
    syncPreview();
  });

  sectionTabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      setSection(btn.dataset.section ?? "profile");
    });
  });

  // Tags fill the directory card's typographic face as well as the profile
  // view, so they sync both; openTo reaches only the profile view.
  // <tag-selector> dispatches a bubbling `change`; <open-to-selector> has no
  // event of its own, but the native `change` from its checkboxes bubbles to
  // the form just the same.
  tagSelector?.addEventListener("change", syncPreview);
  openToSelector?.addEventListener("change", syncProfileView);

  nameInput.addEventListener("input", syncPreview);
  roleInput.addEventListener("input", syncPreview);
  roleDeInput.addEventListener("input", syncPreview);
  bioInput.addEventListener("input", syncPreview);
  bioDeInput.addEventListener("input", syncPreview);
  portfolioInput.addEventListener("input", syncPreview);
  affiliationInput.addEventListener("input", syncProfileView);
  locationInput.addEventListener("input", syncProfileView);
  languageInputs.forEach((input) => input.addEventListener("change", syncProfileView));
  visualNeedsSelector?.addEventListener("visual-needs-change", syncProfileView);

  avatarInput.addEventListener("change", async () => {
    const file = avatarInput.files?.[0];
    if (!file) return;

    const validation = validateAvatar(file);
    if (!validation.ok) {
      uploadStatus.textContent = validation.error!;
      uploadStatus.style.display = "block";
      resizedAvatarBlob = null;
      avatarInput.value = "";
      return;
    }

    uploadStatus.textContent = s["profile.upload.processing"];
    uploadStatus.style.display = "block";
    avatarProcessing = true;
    try {
      ({ blob: resizedAvatarBlob, color: avatarColor } = await resizeAvatar(file));
      const previewUrl = URL.createObjectURL(resizedAvatarBlob);
      showPreview(previewUrl);
      uploadStatus.textContent = `${s["profile.upload.selected"]}${file.name}`;
    } catch {
      uploadStatus.textContent = s["profile.upload.error"];
      resizedAvatarBlob = null;
    } finally { avatarProcessing = false; }
  });

  // THE LOAD CAN FAIL, AND SAYS SO (2026-09-09, Josh: "on iPhone my profile
  // does not load sometimes, I have to press reload"). Until today the chain
  // below — token check, user document, gallery query, publish flag — ran
  // with no error handler and no clock, so one rejected or stalled step left
  // "Loading profile…" on screen for ever. Mobile Safari makes a stall
  // likely: it suspends the tab when the member switches apps and Firestore's
  // channel does not always come back, and App Check attestation on a phone
  // is slow enough that the first read can wait a long time for its token.
  // Now the whole chain races a timer. Losing shows a sentence and a button;
  // the button re-runs the chain in place, and if that fails too it reloads
  // the page, which is the one remedy known to work. Coming back to the tab
  // after a failure retries once on its own.
  const LOAD_TIMEOUT_MS = 15000;
  let loadGeneration = 0;
  let loadFailures = 0;
  let loadState: "loading" | "loaded" | "failed" = "loading";

  function markLoaded() {
    loadState = "loaded";
    if (loadingEl) loadingEl.style.display = "none";
    form.classList.add("is-loaded");
    if (!draft && auth.currentUser) {
      // Explicit allowlist excludes account credentials, email and phone.
      const ids = ["name", "role", "role-de", "bio", "bio-de", "portfolio", "affiliation", "location"];
      const fields = () => Object.fromEntries(ids.map(id => [id, (document.getElementById(id) as HTMLInputElement).value]));
      const read = () => ({ fields: fields(), gallery, projects, tags: tagSelector?.value ?? [],
        memberType: memberTypeSelector?.value ?? "", openTo: openToSelector?.value ?? [],
        visualNeeds: visualNeedsSelector?.value ?? [], social: socialStored(), languages: getSelectedLanguages(), audiences: getSelectedPrimaryAudiences() });
      draft = editorDraft({ key: `profile-draft:${auth.app.options.projectId}:${auth.currentUser.uid}`, root: form, read,
        readDirty: () => ({ ...read(), phone: phoneInput.value, active: activeInput.checked, preferredLanguage: preferredLanguageInput.value, wants: wantsToContributeInput.checked, receive: receiveCommunityEmailsInput.checked, languages: getSelectedLanguages(), audiences: getSelectedPrimaryAudiences(), avatar: resizedAvatarBlob?.size ?? 0 }),
        restore(value: ReturnType<typeof read>) {
          if (!value || !value.fields || !Array.isArray(value.gallery) || !Array.isArray(value.projects)) return;
          ids.forEach(id => { if (typeof value.fields[id] === "string") (document.getElementById(id) as HTMLInputElement).value = value.fields[id]; });
          // A recovered draft cannot resurrect deleted media.
          const liveIds = new Set(gallery.map(item => item.imageId));
          gallery = value.gallery.filter(item => liveIds.has(item.imageId)); projects = value.projects;
          if (tagSelector) tagSelector.value = value.tags;
          if (memberTypeSelector) memberTypeSelector.value = value.memberType;
          if (openToSelector) openToSelector.value = value.openTo;
          if (visualNeedsSelector) visualNeedsSelector.value = value.visualNeeds;
          setSocialValues(splitSocial(value.social));
          setSelectedLanguages(value.languages);
          primaryAudienceInputs.forEach(input => { input.checked = (value.audiences ?? []).includes(input.value); });
          renderGallery(); syncPreview();
        }, labels: lang === "de" ? {
          found: "Profiltexte und Werkdetails sind in diesem Tab gespeichert. Kontoeinstellungen und ausstehende Dateien bitte erneut eingeben.",
          restore: "Entwurf wiederherstellen", discard: "Verwerfen", leave: "Ungespeicherte Änderungen. Seite verlassen? Der Entwurf bleibt in diesem Tab gespeichert.",
        } : { found: "Profile text and work details are saved in this tab. Re-enter account settings and select pending files again.",
          restore: "Restore draft", discard: "Discard", leave: "Unsaved changes. Leave this page? Your draft will remain saved in this tab." },
      });
    }
  }

  function showLoadFailed(user: User | null) {
    loadState = "failed";
    if (!loadingEl) return;
    loadingEl.textContent = "";
    loadingEl.classList.add("is-failed");
    loadingEl.style.display = "";
    const text = document.createElement("p");
    text.textContent = s["profile.loadFailed"];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-outline";
    btn.textContent = s["profile.loadRetry"];
    btn.addEventListener("click", () => {
      const current = user ?? auth.currentUser;
      if (!current || loadFailures >= 2) {
        window.location.reload();
        return;
      }
      void runLoad(current);
    });
    loadingEl.append(text, btn);
  }

  async function runLoad(user: User) {
    const generation = ++loadGeneration;
    loadState = "loading";
    if (loadingEl) {
      loadingEl.classList.remove("is-failed");
      loadingEl.textContent = s["profile.loading"];
      loadingEl.style.display = "";
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clock = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("profile load timed out")), LOAD_TIMEOUT_MS);
    });
    const load = loadProfile(user);
    try {
      await Promise.race([load, clock]);
      if (generation === loadGeneration) markLoaded();
    } catch (err) {
      if (generation !== loadGeneration) return;
      loadFailures++;
      console.warn("[profile] load failed:", err);
      showLoadFailed(user);
      // A run that only lost the race may still finish. If it does, and
      // nothing newer has started, the page is in fact loaded — say so
      // rather than leaving the retry button over a filled-in form.
      load.then(
        () => {
          if (generation === loadGeneration && loadState === "failed") markLoaded();
        },
        () => {},
      );
    } finally {
      clearTimeout(timer);
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (loadState !== "failed") return;
    const current = auth.currentUser;
    if (current && loadFailures < 2) void runLoad(current);
  }, { signal: lifecycle.signal });

  async function loadProfile(user: User) {
    const data = await getUser(user.uid);
    if (lifecycle.signal.aborted) return;

    // Sign-in lands here, so this is where a member's stored language takes
    // them to their locale — unless they switched EN / DE on this visit,
    // which wins (src/lib/siteLanguage.ts has the full set of limits).
    const localeTarget = preferredLocaleTarget(
      data.preferredLanguage, lang, window.location.pathname, readSessionChoice()
    );
    if (localeTarget) {
      window.location.replace(localeTarget + window.location.search + window.location.hash);
      return;
    }

    currentPhotoImageId = data.photoImageId ?? "";
    await ensureEmailSynced(user, data.email);
    if (lifecycle.signal.aborted) return;
    // Safe to call here: showDeletionBanner and the consts it closes over are declared below, but the auth callback cannot run before this astro:page-load body has finished.
    if (data.status === "pendingDeletion" && data.purgeAfter) {
      // getUser() hands back raw Firestore data, so at runtime this is a
      // Timestamp even though UserDoc types it as Date.
      const purgeAfter = data.purgeAfter as unknown as { toDate(): Date };
      showDeletionBanner(purgeAfter.toDate().toISOString());
    }

    nameInput.value = data.displayName ?? user.displayName ?? "";
    roleInput.value = data.role ?? "";
    roleDeInput.value = data.roleDe ?? "";
    bioInput.value = data.bio ?? "";
    bioDeInput.value = data.bioDe ?? "";
    portfolioInput.value = data.portfolio ?? "";
    // The stored string IS the row list — an old single-value profile simply
    // arrives as one row, with nothing to migrate.
    setSocialValues(splitSocial(data.socialMedia ?? ""));
    affiliationInput.value = data.affiliation ?? "";
    locationInput.value = data.location ?? "";
    setSelectedLanguages(data.languages ?? []);
    if (visualNeedsSelector) {
      visualNeedsSelector.value = Array.isArray(data.visualNeeds)
        ? data.visualNeeds.filter(Boolean)
        : [];
    }
    if (memberTypeSelector) {
      memberTypeSelector.value = data.memberType ?? "";
      syncMemberTypeCopy();
    }
    if (openToSelector) {
      openToSelector.value = Array.isArray(data.openTo) ? data.openTo.filter(Boolean) : [];
    }
    if (tagSelector) {
      tagSelector.value = Array.isArray(data.tags) ? data.tags.filter(Boolean).slice(0, 7) : [];
    }
    setSelectedPrimaryAudiences(data.primaryAudiences ?? []);
    // The id list joined to this member's own live records — one query, then
    // the pure join in galleryRecords.ts. Since 2026-09-07 the stored array
    // is ids only; the words come from the records. (Until today this was
    // sanitizeGalleryItems(), stripping withdrawn keys out of stored objects;
    // there are no objects in the array to strip now.)
    gallery = await loadGallery(user.uid, data.gallery);
    // PROJECTS (2026-09-23): the member's project documents, then the
    // gallery made contiguous per stored project — a Save that failed
    // halfway can leave a project's ids apart, and the block must still be
    // one block. If that changed the order, it is stored once, now.
    const records = await loadProjects(user.uid);
    projects = records.map((r) => ({
      projectId: r.projectId,
      ...(r.title ? { title: r.title } : {}),
      ...(r.titleDe ? { titleDe: r.titleDe } : {}),
      ...(r.description ? { description: r.description } : {}),
      ...(r.descriptionDe ? { descriptionDe: r.descriptionDe } : {}),
      ...(r.link ? { link: r.link } : {}),
      affiliations: editorAffiliations(r.affiliations),
      ...(Array.isArray(r.tags) && r.tags.length ? { tags: r.tags } : {}),
    }));
    storedProjectIds = new Set(records.map((r) => r.projectId));
    deletedProjectIds.clear();
    // An id naming no stored project goes now, or saveGalleryRecords()
    // would write it back onto the record at every Save.
    gallery = withoutDanglingProjects(gallery, storedProjectIds);
    const contiguous = contiguousOrder(gallery, (g) => g.projectId);
    const reordered = !sameIds(gallery, contiguous);
    gallery = contiguous;
    // Never chosen: offer the locale they are reading in, not a blanket German.
    // Set before the gallery renders: its folded rows speak this language.
    preferredLanguageInput.value = isSiteLanguage(data.preferredLanguage) ? data.preferredLanguage : lang;
    renderGallery();
    if (reordered) void persistGalleryNow();
    // Slugs for the preview's member credits; a failure only means the
    // credits preview as plain text until the next load.
    const creditUids = projects.flatMap((p) => p.affiliations.flatMap((a) => (a.memberUid ? [a.memberUid] : [])));
    if (creditUids.length) {
      void memberSlugs(creditUids)
        .then((slugs) => {
          previewSlugs = slugs;
          syncPreview();
        })
        .catch(() => {});
    } else previewSlugs = new Map();
    phoneInput.value = data.phone ?? "";
    wantsToContributeInput.checked = data.wantsToContribute ?? false;
    communityEmailPreferenceKnown = typeof data.receiveCommunityEmails === "boolean";
    communityEmailPreferenceChanged = false;
    receiveCommunityEmailsInput.checked = data.receiveCommunityEmails === true;
    receiveCommunityEmailsNote.textContent = communityEmailPreferenceKnown
      ? s["profile.receiveCommunityEmails.note"]
      : s["profile.receiveCommunityEmails.unknown"];
    activeInput.checked = await getPublicProfileActive(user.uid);
    syncHiddenBanner(user.emailVerified, activeInput.checked);
    showPreview(data.photoURL ?? user.photoURL ?? "");
  }

  // requireAuth settles the verification claim before calling back, and that
  // step has no clock of its own: if auth itself never answers, the timer
  // below shows the same failure, whose button reloads for want of a user.
  const authWatchdog = setTimeout(() => {
    if (loadState === "loading" && loadGeneration === 0) {
      loadFailures = 2;
      showLoadFailed(null);
    }
  }, LOAD_TIMEOUT_MS);

  unsubscribeAuth?.();
  unsubscribeAuth = requireAuth(async (user) => {
    clearTimeout(authWatchdog);
    // The admin link, shown only to an admin. Two reads, exactly as the
    // console's own gate does it: the cached token first (free, right for
    // every established admin), then ONE forced refresh before concluding
    // "not an admin" — a claim granted since this browser last signed in is
    // not in the cached token for up to an hour.
    void (async () => {
      const adminLink = document.getElementById("admin-link");
      if (!adminLink) return;
      try {
        let claims = (await user.getIdTokenResult()).claims;
        if (claims.admin !== true) claims = (await user.getIdTokenResult(true)).claims;
        if (claims.admin === true) adminLink.hidden = false;
      } catch {
        // Offline or a token that will not refresh: leave it hidden. The
        // console is still reachable by URL and gates itself.
      }
    })();

    const verifyBanner = document.getElementById("verify-banner")!;
    const btnResendVerify = document.getElementById("btn-resend-verify") as HTMLButtonElement;
    const verifyBannerSent = document.getElementById("verify-banner-sent")!;

    if (!user.emailVerified) {
      verifyBanner.style.display = "block";
      // The banner used to ask for verification as housekeeping ("to secure
      // your account"); what it costs the member is the directory, and an
      // unverified profile is hidden from it however the Active box reads
      // (canPublish in firestore.rules). Said here, once, in the banner
      // that already names the fix (2026-09-08).
      const bannerText = verifyBanner.querySelector(".verify-banner-text");
      if (bannerText?.firstChild?.nodeType === Node.TEXT_NODE) {
        bannerText.firstChild.textContent = `${s["profile.verifyBanner"]} ${s["profile.verifyBanner.hidden"]} `;
      }
      document.getElementById("gallery-note")!.hidden = true;
      document.getElementById("gallery-note-unverified")!.hidden = false;
      let resendCooldown = false;
      btnResendVerify.addEventListener("click", async () => {
        if (resendCooldown) return;
        resendCooldown = true;
        btnResendVerify.disabled = true;
        try {
          await sendEmailVerification(user, returnTo(lang, "/profile"));
          verifyBannerSent.style.display = "block";
        } catch {
          // silently fail — user can try again after cooldown
        }
        setTimeout(() => {
          resendCooldown = false;
          btnResendVerify.disabled = false;
        }, 30000);
      });
    }

    await runLoad(user);
  });

  document.getElementById("btn-logout")!.addEventListener("click", async () => {
    if (draft?.hasChanges() && !await confirmDialog(lang === "de" ? "Abmelden? Ungespeicherte Änderungen bleiben als Entwurf in diesem Tab." : "Sign out? Unsaved changes remain as a draft in this tab.")) return;
    draft?.dispose();
    await signOut(auth);
    window.location.href = prefix || "/";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    saveMsg.style.display = "none";
    saveError.style.display = "none";

    const user = auth.currentUser;
    if (!user) return;

    if (saveButton.disabled) return;
    if (avatarProcessing || restoringThumbs.size || galleryQueue.tasks().some(task => task.state !== "error") || videoPending || galleryWrite) {
      saveError.textContent = lang === "de" ? "Bitte warten, bis die Uploads abgeschlossen sind." : "Please wait for uploads to finish before saving.";
      saveError.style.display = "block"; return;
    }
    for (const result of [validateBio(bioInput.value), validateBio(bioDeInput.value), validateSocialMedia(socialStored())]) {
      if (!result.ok) { saveError.textContent = result.error ?? s["profile.save.error"]; saveError.style.display = "block"; return; }
    }
    const memberType = memberTypeSelector?.value ?? "";
    setSaving(true);

    try {
      const savedLanguage = preferredLanguageInput.value === "en" ? "en" : "de";
      const shouldSaveCommunityEmailPreference =
        communityEmailPreferenceKnown || communityEmailPreferenceChanged;
      // PROJECTS FIRST (2026-09-23): an image record must never name a
      // project that does not exist yet. Then the records (with projectId),
      // then the profile's order, then the projects no image names any
      // more. Only projects an image names are written — a block created
      // and never filled stays local, so Firestore never holds a project
      // that was empty from birth. A refused project write is THE Save
      // error, naming the project as its header does.
      const emptiedAtStart = await persistWorkMetadata(user.uid, gallery, projects, storedProjectIds, deletedProjectIds, lang, s);

      const saved = await handleProfileUpdate(
        user,
        {
          displayName: nameInput.value.trim(),
          // Omit rather than write "" — the field is absent until chosen.
          ...(isMemberType(memberType) ? { memberType } : {}),
          role: roleInput.value.trim(),
          roleDe: roleDeInput.value.trim(),
          bio: bioInput.value.trim(),
          bioDe: bioDeInput.value.trim(),
          portfolio: portfolioInput.value.trim(),
          socialMedia: socialStored(),
          affiliation: affiliationInput.value.trim(),
          location: locationInput.value.trim(),
          languages: getSelectedLanguages(),
          // Cleared for creators: the question is hidden for them, so keeping
          // a previous answer would publish something they cannot see or edit.
          visualNeeds: needsVisuals(memberType) ? (visualNeedsSelector?.value ?? []) : [],
          openTo: openToSelector?.value ?? [],
          primaryAudiences: getSelectedPrimaryAudiences(),
          tags: tagSelector?.value ?? [],
          // The ids, in order. The words typed for each image are written
          // onto the records ABOVE, before this call — see saveGalleryRecords.
          gallery: galleryIds(gallery),
          wantsToContribute: wantsToContributeInput.checked,
          preferredLanguage: savedLanguage,
          ...(shouldSaveCommunityEmailPreference
            ? { receiveCommunityEmails: receiveCommunityEmailsInput.checked }
            : {}),
          phone: phoneInput.value.trim(),
          resizedAvatarBlob,
          previousPhotoImageId: currentPhotoImageId,
          ...(resizedAvatarBlob && avatarColor ? { photoColor: avatarColor } : {}),
        },
        (pct) => {
          uploadStatus.textContent = `${s["profile.upload.uploading"]} ${pct}%`;
          uploadStatus.style.display = "block";
        }
      );

      if (saved.photoImageId) currentPhotoImageId = saved.photoImageId;

      // Stored projects that no image names any more — dragged empty, or
      // deleted through the menu. A failed delete does not fail the Save:
      // an empty project is invisible (the build skips it) and the next
      // Save tries again; the ids that did go leave every set.
      const emptied = projectsToDelete(emptiedAtStart, gallery);
      const deleteFailures = await deleteProjects(emptied);
      deleteFailures.forEach((f) => console.warn(`[projects] ${f.projectId} not deleted:`, f.error));
      for (const id of emptied) {
        if (deleteFailures.some((f) => f.projectId === id)) continue;
        storedProjectIds.delete(id);
        deletedProjectIds.delete(id);
        projects = projects.filter((p) => p.projectId !== id);
      }
      renderGallery();

      if (shouldSaveCommunityEmailPreference) {
        communityEmailPreferenceKnown = true;
        communityEmailPreferenceChanged = false;
        receiveCommunityEmailsNote.textContent = s["profile.receiveCommunityEmails.note"];
      }

      if (resizedAvatarBlob) {
        uploadStatus.textContent = s["profile.upload.complete"];
      }

      await setProfileActive(user.uid, activeInput.checked);
      syncHiddenBanner(user.emailVerified, activeInput.checked);
      const queued = await triggerRebuild();
      watchPublication(saveMsg, lang, queued, lifecycle.signal);
      resizedAvatarBlob = null;
      draft?.saved();
      saveMsg.style.display = "block";

      // A GALLERY ERROR MUST NOT OUTLIVE THE SAVE THAT SETTLED IT.
      //
      // The gallery line is written by the upload queue, which fails on its
      // own schedule and has no idea a Save has since happened. So a member
      // who hit a refused array write and then saved successfully was shown
      // "Your sign-in expired. Sign in again, then try once more." directly
      // above a green "Changes saved." — the editor contradicting itself, and
      // the wrong half is the one that sounds urgent.
      //
      // Cleared through the cap-note bookkeeping rather than around it:
      // zeroing galleryCapNote first is what lets updateGalleryControls take
      // the line back, so a gallery that really is full says so again instead
      // of falling silent.
      setGalleryStatus("");
      galleryCapNote = "";
      updateGalleryControls();

      // Choosing a language here is as explicit as the EN / DE switch, so the
      // site follows it now rather than at the next sign-in.
      if (savedLanguage !== lang) {
        rememberSessionChoice(savedLanguage);
        window.location.replace(localePath(window.location.pathname, savedLanguage));
      }
    } catch (err: unknown) {
      saveError.textContent = err instanceof Error ? err.message : s["profile.save.error"];
      saveError.style.display = "block";
    } finally {
      setSaving(false);
    }
  });

  // ── Delete account ──────────────────────────────────────────────
  // Delete through requestAccountDeletion, which destroys the account
  // outright — documents, files and the Auth user (2026-09-04, Josh:
  // "scheduled deletion is unnecessary. just make it delete accounts
  // straight away"). Two things now stand between a stray click and an
  // irreversible one: the account's own email address, typed out, and the
  // password. Neither is optional — the callable checks auth_time
  // server-side, so the password cannot be skipped from here, and the
  // address is checked again at click time rather than trusted to the
  // button's disabled attribute.
  //
  // showDeletionBanner and the "Keep my account" button below are NOT dead
  // code — an admin can still schedule a dated deletion through adminOps,
  // and a member whose account is in that state still needs to see it and
  // still needs a way out.
  const deleteIdle = document.getElementById("delete-idle")!;
  const deleteReauth = document.getElementById("delete-reauth")!;
  const deleteScheduled = document.getElementById("delete-scheduled")!;
  const deleteScheduledText = document.getElementById("delete-scheduled-text")!;
  const reauthInput = document.getElementById("reauth-password") as HTMLInputElement;
  const reauthError = document.getElementById("reauth-error")!;
  const confirmEmail = document.getElementById("delete-confirm-email") as HTMLInputElement;
  const confirmTarget = document.getElementById("delete-confirm-target")!;
  const confirmError = document.getElementById("delete-confirm-error")!;
  const confirmBtn = document.getElementById("btn-reauth-confirm") as HTMLButtonElement;
  const banner = document.getElementById("deletion-banner")!;
  const bannerText = document.getElementById("deletion-banner-text")!;
  const keepBtn = document.getElementById("btn-keep-account") as HTMLButtonElement;

  function showDeleteView(view: "idle" | "reauth" | "scheduled") {
    deleteIdle.style.display = view === "idle" ? "block" : "none";
    deleteReauth.style.display = view === "reauth" ? "block" : "none";
    deleteScheduled.style.display = view === "scheduled" ? "block" : "none";
  }

  function showDeletionBanner(purgeAfterIso: string) {
    bannerText.textContent = s["profile.delete.banner"].replace("{date}", fmtDate(purgeAfterIso));
    banner.style.display = "flex";
    deleteScheduledText.textContent = s["profile.delete.scheduled"].replace(
      "{date}",
      fmtDate(purgeAfterIso)
    );
    showDeleteView("scheduled");
  }

  /**
   * The address the member has to reproduce. Read at the moment the view
   * opens rather than once at load, because changing your email and then
   * deleting your account in the same sitting is a perfectly ordinary thing
   * to do, and the stale address would be unreproducible.
   */
  function deleteTargetEmail() {
    return (auth.currentUser?.email ?? "").trim().toLowerCase();
  }

  /**
   * Case and surrounding space are forgiven; nothing else is. Addresses are
   * case-insensitive in practice, and a member who copies theirs out of a
   * mail client will bring whitespace with it — neither is the mistake this
   * gate exists to catch.
   */
  function deleteConfirmMatches() {
    const target = deleteTargetEmail();
    return target !== "" && confirmEmail.value.trim().toLowerCase() === target;
  }

  /**
   * The button is the gate. The message appears only once there is something
   * wrong to say — a red line under an empty field is scolding someone for
   * not having typed yet.
   */
  function updateDeleteGate(busy = false) {
    const ok = deleteConfirmMatches();
    confirmBtn.disabled = busy || !ok;
    const typed = confirmEmail.value.trim() !== "";
    if (!ok && typed) {
      confirmError.textContent = s["profile.delete.typeMismatch"];
      confirmError.style.display = "block";
    } else {
      confirmError.style.display = "none";
    }
  }

  confirmEmail.addEventListener("input", () => updateDeleteGate());

  async function reauthenticate(password: string) {
    const user = auth.currentUser;
    if (!user || !user.email) throw new Error("not signed in");
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    return user;
  }

  document.getElementById("btn-delete-start")!.addEventListener("click", () => {
    confirmTarget.textContent = auth.currentUser?.email ?? "";
    confirmEmail.value = "";
    updateDeleteGate();
    showDeleteView("reauth");
  });
  document.getElementById("btn-reauth-cancel")!.addEventListener("click", () => {
    // Leave nothing loaded behind the Cancel: reopening the panel should
    // cost the same two deliberate acts it cost the first time.
    reauthInput.value = "";
    confirmEmail.value = "";
    reauthError.style.display = "none";
    updateDeleteGate();
    showDeleteView("idle");
  });

  confirmBtn.addEventListener("click", async () => {
    // The disabled button is the gate a member sees; this is the gate. A
    // stale click landing after the field was edited, or the attribute going
    // missing, must not be the difference between an account and no account.
    if (!deleteConfirmMatches()) {
      updateDeleteGate();
      return;
    }
    const btn = confirmBtn;
    updateDeleteGate(true);
    btn.textContent = s["profile.reauth.confirming"];
    reauthError.style.display = "none";
    try {
      await reauthenticate(reauthInput.value);
    } catch {
      reauthError.textContent = s["profile.reauth.error"];
      reauthError.style.display = "block";
      updateDeleteGate();
      btn.textContent = s["profile.delete.confirm"];
      return;
    }
    try {
      await requestAccountDeletion();
      draft?.discard();
      reauthInput.value = "";
      // The account is GONE by the time this resolves — documents, files and
      // the Auth user. So there is no profile left to render and no session
      // left to render it with: signing out and leaving is the only honest
      // next screen, and `replace` keeps Back from returning to an editor
      // whose every field would now fail to load.
      await signOut(auth).catch(() => {});
      window.location.replace(prefix + "/");
      return;
    } catch {
      reauthError.textContent = s["profile.delete.error"];
      reauthError.style.display = "block";
    } finally {
      updateDeleteGate();
      btn.textContent = s["profile.delete.confirm"];
    }
  });

  keepBtn.addEventListener("click", async () => {
    keepBtn.disabled = true;
    keepBtn.textContent = s["profile.delete.keeping"];
    try {
      await cancelAccountDeletion();
      window.location.reload();
    } catch {
      keepBtn.disabled = false;
      keepBtn.textContent = s["profile.delete.keep"];
    }
  });

  // ── Change email ────────────────────────────────────────────────
  // Auth does the safe part: the link goes to the NEW address and the swap
  // happens only when it is clicked. The Firestore mirror follows on the
  // next load through ensureEmailSynced.
  const emailNew = document.getElementById("email-new") as HTMLInputElement;
  const emailPassword = document.getElementById("email-password") as HTMLInputElement;
  const emailMsg = document.getElementById("email-msg")!;
  const emailError = document.getElementById("email-error")!;
  const emailBtn = document.getElementById("btn-email-change") as HTMLButtonElement;
  const emailIdle = document.getElementById("email-idle")!;
  const emailForm = document.getElementById("email-form")!;

  function showEmailForm(open: boolean) {
    emailIdle.hidden = open;
    emailForm.hidden = !open;
  }

  document.getElementById("btn-email-start")!.addEventListener("click", () => {
    showEmailForm(true);
    emailNew.focus();
  });

  // Cancel empties the password too. Leaving a typed credential in a field
  // that is merely display:none is not a thing to do casually.
  document.getElementById("btn-email-cancel")!.addEventListener("click", () => {
    emailNew.value = "";
    emailPassword.value = "";
    emailMsg.style.display = "none";
    emailError.style.display = "none";
    showEmailForm(false);
  });

  emailBtn.addEventListener("click", async () => {
    const next = emailNew.value.trim();
    emailMsg.style.display = "none";
    emailError.style.display = "none";
    if (!next.includes("@")) return;
    emailBtn.disabled = true;
    emailBtn.textContent = s["profile.email.sending"];
    try {
      const user = await reauthenticate(emailPassword.value);
      await verifyBeforeUpdateEmail(user, next, returnTo(lang, "/profile"));
      emailMsg.textContent = s["profile.email.sent"].replace("{email}", next);
      emailMsg.style.display = "block";
      emailNew.value = "";
      emailPassword.value = "";
    } catch {
      emailError.textContent = s["profile.email.error"];
      emailError.style.display = "block";
    } finally {
      emailBtn.disabled = false;
      emailBtn.textContent = s["profile.email.submit"];
    }
  });
});
