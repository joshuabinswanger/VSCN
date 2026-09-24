/**
 * One member, in grouped <details> sections, and one image record.
 *
 * The guiding rule: memberGraph already sends the ENTIRE users/{uid} and
 * publicProfiles/{uid} documents, so nothing arriving here may be dropped.
 * Curated sections show what fields.ts knows; "Other fields" shows what it
 * does not; the raw JSON at the bottom shows everything regardless.
 *
 * HARD CONSTRAINT (styles, not here, but worth repeating where the markup is
 * made): no `display: contents` on <details> or <summary> — WebKit bug
 * 320447 made another page of this site unopenable on iOS.
 */
import {
  type AdminAction, type AdminImage, type AdminProject, type MemberGraph, listActions, purgeAccount,
  restoreAccount, setMemberEmail, setProfileActive,
} from "../adminApi.ts";
import type { Dialogs } from "./dialog.ts";
import { type Child, type Reporter, copyable, dl, el, fmt, linkBtn } from "./dom.ts";
import {
  type Doc, type FieldSpec, ONBOARDING_FIELDS, PRIVATE_ONLY_FIELDS, PUBLIC_ONLY_FIELDS, SHARED_FIELDS,
  compareDocs, differenceNote, galleryIds, renderValue, unknownKeys,
} from "./fields.ts";

export interface DetailDeps extends Reporter {
  go(hash: string): void;
  /** Reload the roster — its flags are stale after any mutation. */
  reload(): Promise<void>;
  /** Re-fetch and re-render this member after a mutation. */
  showMember(uid: string): Promise<void>;
  dialogs: Dialogs;
  fileUrl(storagePath: string): string;
  memberName(uid: string): string | undefined;
  deleteImageButton(img: AdminImage, after: () => Promise<void>): HTMLButtonElement;
  crumbs(...extra: Child[]): HTMLElement;
  imageCache: Map<string, AdminImage>;
}

const goImage = (deps: DetailDeps) => (id: string) => deps.go(`#image/${encodeURIComponent(id)}`);
const goMember = (deps: DetailDeps, uid: string) => deps.go(`#uid/${encodeURIComponent(uid)}`);

/**
 * WHICH SECTIONS ARE OPEN WHEN A MEMBER FIRST APPEARS.
 *
 * The console shipped with Public profile and Images shut, and an admin who
 * opened a member to check their website saw neither the website nor the
 * pictures — the record looked emptier than the one it was describing. The
 * sections that hold what the MEMBER put there now open; the ones that hold
 * plumbing (onboarding, deletion, audit, raw JSON) stay shut until asked for.
 */
const OPEN_BY_DEFAULT = new Set(["overview", "identity", "public", "images"]);

const SECTION_STORAGE_KEY = "vscn-admin-open-sections";

/**
 * …and the admin's own answer outranks that default, on every member they
 * look at next. Someone auditing raw documents all afternoon should not have
 * to open the same fold on every record. localStorage can throw — private
 * mode, blocked storage — so a failure here just means the defaults apply.
 */
function loadOpenSections(): Set<string> | null {
  try {
    const raw = localStorage.getItem(SECTION_STORAGE_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === "string")) : null;
  } catch {
    return null;
  }
}

function rememberOpenSection(key: string, open: boolean): void {
  try {
    const set = loadOpenSections() ?? new Set(OPEN_BY_DEFAULT);
    if (open) set.add(key);
    else set.delete(key);
    localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* not persisted; this member's tree still shows what was clicked */
  }
}

/**
 * A collapsible section. `badge` sits in the summary next to the title (a
 * count, a warning).
 *
 * `force` is for a section with something to SAY — two documents that
 * disagree, a purge that is running. That always opens, whatever the admin
 * last chose, because a collapsed warning is no warning.
 */
function section(
  key: string, title: string,
  opts: { force?: boolean; badge?: Child; danger?: boolean } = {},
  ...body: Child[]
): HTMLDetailsElement {
  const sec = el("details", { class: `sec${opts.danger ? " sec--danger" : ""}`, "data-sec": key },
    el("summary", { class: "sec__sum" }, el("h2", { class: "sec__title" }, title), opts.badge),
    el("div", { class: "sec__body" }, ...body),
  );
  const remembered = loadOpenSections();
  sec.open = opts.force === true || (remembered ? remembered.has(key) : OPEN_BY_DEFAULT.has(key));
  sec.addEventListener("toggle", () => rememberOpenSection(key, sec.open));
  return sec;
}

/**
 * One document's side of the comparison. `side` says which of the two `doc`
 * IS — and it is not decoration: differenceNote() names the collections in
 * words ("public: … · private: …"), so ordering the pair by argument position
 * labelled every marker in the users/ section backwards, naming the wrong
 * document as the holder of each value. The side travels with the comparison
 * so the sentence can never drift from the document it describes.
 */
interface DocCmp {
  differing: Set<string>;
  other: Doc;
  side: "public" | "private";
}

/**
 * The rows of one document, in the declared order. A key that differs from
 * the other document gets a marker with the other side's value in its title.
 */
function docRows(
  doc: Doc, specs: FieldSpec[], deps: DetailDeps,
  cmp?: DocCmp,
): HTMLDListElement {
  const out = el("dl");
  for (const s of specs) {
    if (!(s.key in doc) && !cmp?.differing.has(s.key)) continue; // absent and agreed-absent: nothing to say
    const dt = el("dt", { title: s.key }, s.label);
    const dd = el("dd");
    if (s.key in doc) dd.append(renderValue(doc[s.key], s.kind, { goImage: goImage(deps) }));
    else dd.append(el("span", { class: "muted" }, "(absent)"));
    if (cmp?.differing.has(s.key)) {
      dt.classList.add("differs");
      dd.append(" ", el("span", { class: "tag tag--diff", title: cmp.side === "public"
          ? differenceNote(s.key, doc, cmp.other)
          : differenceNote(s.key, cmp.other, doc) }, "≠ differs"));
    }
    out.append(dt, dd);
  }
  return out;
}

/** Keys no list names — rendered generically so a new field is never invisible. */
function otherRows(doc: Doc, keys: string[], deps: DetailDeps, cmp?: DocCmp): Child[] {
  if (!keys.length) return [];
  return [
    el("h3", {}, "Other fields"),
    el("p", { class: "muted small" }, "Present in the document but not in the console's field list (src/lib/admin/fields.ts)."),
    docRows(doc, keys.map((k) => ({ key: k, label: k, kind: "json" as const })), deps, cmp),
  ];
}

export function renderMemberDetail(g: MemberGraph, deps: DetailDeps): HTMLElement {
  for (const i of g.images) deps.imageCache.set(i.imageId, i);
  const pub: Doc | null = g.publicProfile;
  const usr: Doc | null = g.user;
  const any: Doc = { ...(usr ?? {}), ...(pub ?? {}) };
  const moderationHidden = pub?.moderationHidden === true;
  const active = pub !== null && pub.active !== false && !moderationHidden;
  const pending = Boolean(g.deletion && !g.deletion.completedAt);
  const cmp = compareDocs(pub, usr);
  const gallery = galleryIds(pub ?? usr);
  const avatarId = typeof any.photoImageId === "string" ? any.photoImageId : null;
  const name = String(any.displayName ?? g.uid);

  // ── Actions ─────────────────────────────────────────────
  const action = (label: string, cls: string, run: () => Promise<unknown>, done: string, confirm?: {
    message: string; confirmLabel: string; danger?: boolean;
  }, then: "member" | "list" = "member") => {
    const b = el("button", { type: "button", class: cls }, label);
    b.addEventListener("click", async () => {
      if (confirm && !(await deps.dialogs.confirm({ title: label, ...confirm }))) return;
      const ok = await deps.busy(`${label}…`, run, done);
      if (ok === undefined) return;
      // The roster's flags (hidden, deleting) are now stale — reload it so
      // the list agrees with what just happened. A purged member has no
      // record left to re-render, so that one lands on the list.
      await deps.reload();
      if (then === "member") await deps.showMember(g.uid);
      else deps.go("#list");
    });
    return b;
  };

  const routine = el("div", { class: "actions" },
    g.publicProfile && action(
      moderationHidden ? "Remove moderation hide" : "Hide profile", "btn-ghost",
      () => setProfileActive({ uid: g.uid, active: moderationHidden }),
      moderationHidden ? `${name} is visible again.` : `${name} is hidden from the directory.`,
    ),
    g.auth && action("Set email", "btn-ghost", async () => {
      const email = await deps.dialogs.prompt({
        title: "Set email",
        message: `New email address for ${name}. Auth and the users/ mirror are both updated.`,
        defaultValue: g.auth?.email ?? "",
        inputType: "email",
        confirmLabel: "Set email",
      });
      if (email === null) throw new Error("Cancelled.");
      const trimmed = email.trim();
      if (!trimmed) throw new Error("No address entered.");
      return setMemberEmail({ uid: g.uid, email: trimmed });
    }, `Email updated for ${name}.`),
    pending && action("Restore", "btn-solid", () => restoreAccount({ uid: g.uid }), `Deletion cancelled for ${name}.`),
  );

  const danger = el("div", { class: "actions actions--danger" },
    el("span", { class: "danger__label" }, "Danger"),
    !pending && action("Schedule deletion (30 days)", "btn-ghost btn-danger",
      () => purgeAccount({ uid: g.uid }), `Deletion scheduled for ${name}; purge in 30 days unless restored.`, {
        message: `Schedule deletion of ${name} (${g.uid})? The account is blocked from writing and purged after 30 days. The member — or you — can still restore it until then.`,
        confirmLabel: "Schedule deletion", danger: true,
      }),
    action("Purge now", "btn-ghost btn-danger", () => purgeAccount({ uid: g.uid, immediate: true }),
      `${name} purged.`, {
        message: `PERMANENTLY delete ${name} (${g.uid}) — every document, every file and the Auth user, right now. This cannot be undone.`,
        confirmLabel: "Purge permanently", danger: true,
      }, "list"),
  );

  // ── 1. Overview ─────────────────────────────────────────
  const avatarImg = g.images.find((i) => i.kind === "avatar" && (!avatarId || i.imageId === avatarId));
  const avatarSrc = avatarImg ? deps.fileUrl(avatarImg.storagePath) : typeof any.photoURL === "string" ? any.photoURL : "";
  const statusTags = el("div", { class: "chips" },
    el("span", { class: `tag${active ? "" : " tag--warn"}` },
      moderationHidden ? "hidden by administrator" : active ? "public" : pub ? "not published by member" : "no public profile"),
    pending ? el("span", { class: "tag tag--warn" }, `deletion ${fmt(g.deletion!.purgeAfter)}`) : null,
    g.auth?.disabled ? el("span", { class: "tag tag--warn" }, "AUTH DISABLED") : null,
    g.auth?.admin ? el("span", { class: "tag tag--admin" }, "ADMIN") : null,
    !g.auth ? el("span", { class: "tag" }, "no Auth user") : null,
    !usr ? el("span", { class: "tag" }, "no users/ document") : null,
  );
  const slugLinks = g.slugs.length
    ? el("span", {}, ...g.slugs.flatMap((s, i) => [
        i ? ", " : null,
        el("a", { href: `/members/${s.slug}`, target: "_blank", rel: "noreferrer" }, `${s.slug}${s.current ? "" : " (retired)"}`),
      ] as Child[]))
    : el("span", { class: "muted" }, "—");
  const overview = section("overview", "Overview", {},
    el("div", { class: "overview" },
      avatarSrc ? el("img", { class: "avatar", src: avatarSrc, alt: "", loading: "lazy" }) : el("div", { class: "avatar avatar--none" }),
      el("div", { class: "overview__main" },
        statusTags,
        dl([
          ["uid", copyable(g.uid)],
          ["slugs", slugLinks],
          ["member type", renderValue(any.memberType, "text")],
          ["role", renderValue(any.role, "text")],
          ["role (de)", renderValue(any.roleDe, "text")],
          ["affiliation", renderValue(any.affiliation, "text")],
          ["location", renderValue(any.location, "text")],
        ]),
      ),
    ),
  );

  // ── 2. Identity & account ───────────────────────────────
  const a = g.auth;
  const identity = section("identity", "Identity & account", {},
    el("h3", {}, "Firebase Auth"),
    a
      ? dl([
          ["auth email", a.email],
          ["email verified", renderValue(a.emailVerified, "bool")],
          ["disabled", a.disabled
            ? el("span", { class: "tag tag--warn" }, "yes — cannot sign in")
            : renderValue(false, "bool")],
          ["admin claim", a.admin
            ? el("span", { class: "tag tag--admin", title: "This account holds the `admin` custom claim: it can open this console and call every admin* callable." }, "ADMIN — holds the admin claim")
            : renderValue(false, "bool")],
          ["Auth created", el("span", { title: a.createdAt }, fmt(a.createdAt))],
          ["last sign-in", el("span", { title: a.lastSignInAt ?? "" }, fmt(a.lastSignInAt))],
        ])
      : el("p", { class: "muted" }, "No Auth user — a profile document with nobody who can sign in to it."),
    el("h3", {}, "users/ (private half)"),
    usr
      ? docRows(usr, [
          ...PRIVATE_ONLY_FIELDS,
          { key: "createdAt", label: "doc createdAt", kind: "date" },
          { key: "updatedAt", label: "doc updatedAt", kind: "date" },
        ], deps)
      : el("p", { class: "muted" }, "No users/ document."),
  );

  // ── 3. Public profile ───────────────────────────────────
  const pubOther = unknownKeys(pub, SHARED_FIELDS, PUBLIC_ONLY_FIELDS);
  const pubCmp = pub && usr ? { differing: cmp.differing, other: usr, side: "public" as const } : undefined;
  const publicSec = section("public", "Public profile", {
    badge: pub ? el("span", { class: "muted small" }, "publicProfiles/") : el("span", { class: "tag tag--warn" }, "missing"),
  },
    pub
      ? [
          docRows(pub, [...PUBLIC_ONLY_FIELDS, ...SHARED_FIELDS], deps, pubCmp),
          ...otherRows(pub, pubOther, deps, pubCmp),
        ]
      : el("p", { class: "muted" }, "No publicProfiles/ document — this member is not in the directory."),
  );

  // ── 4. Private profile, with disagreements ──────────────
  const usrOther = unknownKeys(usr, SHARED_FIELDS, PRIVATE_ONLY_FIELDS);
  const usrCmp = pub && usr ? { differing: cmp.differing, other: pub, side: "private" as const } : undefined;
  const nDiff = cmp.differing.size;
  const privateSec = section("private", "Private profile (users/)", {
    force: nDiff > 0,
    badge: nDiff
      ? el("span", { class: "tag tag--diff" }, `${nDiff} field${nDiff === 1 ? "" : "s"} disagree${nDiff === 1 ? "s" : ""} with the public profile`)
      : pub && usr ? el("span", { class: "tag tag--yes" }, "matches public profile") : null,
  },
    nDiff
      ? el("p", { class: "note note--diff" },
          "The two documents are written together by the client; a difference usually means the public write was rejected (firestore.rules hasOnly), so the member's page shows something other than what they last saved. Differing: ",
          el("strong", {}, [...cmp.differing].sort().join(", ")), ".")
      : null,
    usr
      ? [
          el("p", { class: "muted small" }, "Private-only fields (email, phone, consent, lifecycle) are in Identity & account above."),
          docRows(usr, SHARED_FIELDS, deps, usrCmp),
          ...otherRows(usr, usrOther, deps, usrCmp),
        ]
      : el("p", { class: "muted" }, "No users/ document."),
  );

  // ── 5. Images ───────────────────────────────────────────
  const thumb = (img: AdminImage) => {
    const pos = img.kind === "avatar"
      ? (avatarId === img.imageId ? "avatar (photoImageId)" : avatarId ? "avatar — NOT the current photoImageId" : "avatar — no photoImageId set")
      : gallery.indexOf(img.imageId) >= 0 ? `#${gallery.indexOf(img.imageId) + 1} of ${gallery.length} in gallery` : "not in gallery";
    const btn = el("button", { type: "button", class: "btn-link" },
      el("img", { src: deps.fileUrl(img.storagePath), alt: img.caption ?? "", loading: "lazy" }));
    btn.addEventListener("click", () => goImage(deps)(img.imageId));
    return el("figure", { class: "thumb" },
      btn,
      el("small", {}, `${img.kind} · ${img.status}${img.origin === "curated" ? " · curated" : ""}`),
      el("small", {}, pos),
      el("small", {}, img.referenced
        ? el("span", { class: "tag tag--yes" }, "on the page")
        : el("span", { class: "tag tag--warn" }, "orphan — nothing points at it")),
      el("small", { class: "muted" }, img.imageId),
    );
  };
  const orphans = g.images.filter((i) => !i.referenced).length;
  const imagesSec = section("images", `Images (${g.images.length})`, {
    badge: orphans ? el("span", { class: "tag tag--warn" }, `${orphans} orphan${orphans === 1 ? "" : "s"}`) : null,
  },
    g.images.length
      ? [el("p", { class: "muted small" }, "Click a picture to open its record."), el("div", { class: "thumbs" }, ...g.images.map(thumb))]
      : el("p", { class: "muted" }, "No image records."),
  );

  // ── 5b. Projects ────────────────────────────────────────
  const projectBlock = (p: AdminProject) => {
    const count = g.images.filter((i) => i.projectId === p.projectId).length;
    return el("div", { class: "project" },
      el("h3", {}, typeof p.title === "string" && p.title ? p.title : "Untitled project"),
      el("p", { class: "muted small" }, p.projectId),
      ...otherRows(p, Object.keys(p).filter((k) => k !== "projectId"), deps),
      el("p", { class: "muted small" }, `${count} image${count === 1 ? "" : "s"} in this project`),
    );
  };
  // `?? []`: an adminLookupMember deployed before projects returns no key.
  const projects = g.projects ?? [];
  const projectsSec = section("projects", `Projects (${projects.length})`, {},
    projects.length ? projects.map(projectBlock) : el("p", { class: "muted" }, "No projects."),
  );

  // ── 6. Onboarding request ───────────────────────────────
  const ob = g.onboardingRequest;
  const onboardingSec = section("onboarding", "Onboarding request", {
    badge: ob ? null : el("span", { class: "muted small" }, "none"),
  },
    ob
      ? [docRows(ob, ONBOARDING_FIELDS, deps), ...otherRows(ob, unknownKeys(ob, ONBOARDING_FIELDS), deps)]
      : el("p", { class: "muted" }, "No onboardingRequests/ document."),
  );

  // ── 7. Deletion job ─────────────────────────────────────
  const d = g.deletion;
  const deletionSec = section("deletion", "Deletion job", {
    force: pending,
    badge: d ? el("span", { class: `tag${pending ? " tag--warn" : ""}` }, pending ? "in progress" : "completed") : el("span", { class: "muted small" }, "none"),
  },
    d
      ? dl([
          ["requested", `${fmt(d.requestedAt)} by ${d.requestedBy}`],
          ["purge after", fmt(d.purgeAfter)],
          ["active before", renderValue(d.activeBefore, "bool")],
          ["image ids", d.imageIds.length ? renderValue(d.imageIds, "gallery", { goImage: goImage(deps) }) : "none"],
          ["steps", el("span", { class: "chips" }, ...Object.entries(d.steps).map(([k, v]) =>
            el("span", { class: `tag ${v ? "tag--yes" : ""}` }, `${k}: ${v ? "done" : "pending"}`)))],
          ["completed", fmt(d.completedAt)],
          ["last error", d.lastError ? el("span", { class: "error" }, d.lastError) : "—"],
        ])
      : el("p", { class: "muted" }, "No deletion job."),
  );

  // ── 8. Audit history — fetched when first opened ────────
  const auditBody = el("p", { class: "muted" }, "Opens to load.");
  const auditSec = section("audit", "Audit history", {}, auditBody);
  let auditLoaded = false;
  auditSec.addEventListener("toggle", async () => {
    if (!auditSec.open || auditLoaded) return;
    auditLoaded = true;
    auditBody.textContent = "Loading…";
    try {
      const { actions } = await listActions({ targetUid: g.uid, limit: 200 });
      auditBody.replaceChildren(renderActions(actions, deps));
    } catch (err) {
      auditLoaded = false; // let a re-open retry
      auditBody.textContent = `Could not load: ${err instanceof Error ? err.message : String(err)}`;
      auditBody.classList.add("error");
    }
  });

  // ── 9. Raw documents ────────────────────────────────────
  const raw = section("raw", "Raw documents", {},
    el("p", { class: "muted small" }, "Exactly what memberGraph returned. Nothing above can hide a field from this."),
    el("h3", {}, "publicProfiles/" + g.uid), el("pre", { class: "raw" }, JSON.stringify(pub, null, 2)),
    el("h3", {}, "users/" + g.uid), el("pre", { class: "raw" }, JSON.stringify(usr, null, 2)),
    el("h3", {}, "auth"), el("pre", { class: "raw" }, JSON.stringify(g.auth, null, 2)),
    el("h3", {}, "onboardingRequests/" + g.uid), el("pre", { class: "raw" }, JSON.stringify(ob, null, 2)),
    el("h3", {}, "deletions/" + g.uid), el("pre", { class: "raw" }, JSON.stringify(d, null, 2)),
    el("h3", {}, "slugs"), el("pre", { class: "raw" }, JSON.stringify(g.slugs, null, 2)),
  );

  return el("div", { class: "card detail" },
    deps.crumbs(),
    el("h2", { class: "detail__name" }, name),
    el("div", { class: "actions-split" }, routine, danger),
    overview, identity, publicSec, privateSec, imagesSec, projectsSec, onboardingSec, deletionSec, auditSec, raw,
  );
}

/** The audit log as a table: when, who, what, and the payload as key/value rows. */
function renderActions(actions: AdminAction[], deps: DetailDeps): Node {
  if (!actions.length) return el("p", { class: "muted" }, "No admin actions recorded for this member.");
  const rows = actions.map((x) => {
    const detail = Object.entries(x.detail ?? {});
    return el("tr", {},
      el("td", { class: "nowrap muted", title: x.at }, fmt(x.at)),
      el("td", {}, x.actorUid && x.actorUid !== x.actorName
        ? linkBtn(x.actorName, () => goMember(deps, x.actorUid))
        : x.actorName || "—"),
      el("td", {}, el("code", {}, x.action)),
      el("td", {}, detail.length
        ? dl(detail.map(([k, v]) => [k, renderValue(v, "json")]))
        : el("span", { class: "muted" }, "—")),
    );
  });
  return el("div", { class: "tablewrap" },
    el("table", { class: "audit" },
      el("thead", {}, el("tr", {}, el("th", {}, "When"), el("th", {}, "Actor"), el("th", {}, "Action"), el("th", {}, "Detail"))),
      el("tbody", {}, ...rows)));
}

/** One image record, opened on its own (#image/<id>). */
export function renderImageDetail(img: AdminImage, deps: DetailDeps): HTMLElement {
  const ownerBtn = linkBtn(deps.memberName(img.ownerUid) || img.ownerUid, () => goMember(deps, img.ownerUid));
  return el("div", { class: "card" },
    deps.crumbs(el("span", { class: "muted" }, "·"), ownerBtn),
    el("h2", {}, `${img.kind} · ${img.status}`),
    el("img", { src: deps.fileUrl(img.storagePath), alt: img.caption ?? "", loading: "lazy",
      style: "max-width:min(100%,32rem);height:auto;border-radius:var(--radius-xs)" }),
    el("h3", {}, "Record"),
    dl([
      ["imageId", copyable(img.imageId)],
      ["owner", linkBtn(img.ownerUid, () => goMember(deps, img.ownerUid))],
      ["kind", img.kind], ["status", img.status], ["origin", img.origin],
      ["on the page", img.referenced
        ? el("span", { class: "tag tag--yes" }, "yes — referenced by the profile")
        : el("span", { class: "tag tag--warn" }, "no — nothing points at it")],
      ["dimensions", `${img.width} × ${img.height}`],
      ["colour", renderValue(img.color, "color")],
      ["caption", img.caption], ["caption (de)", img.captionDe],
      ["description", img.description], ["description (de)", img.descriptionDe],
      ["storagePath", copyable(img.storagePath)],
      ["created", fmt(img.createdAt)],
    ]),
    el("p", {}, el("a", { href: deps.fileUrl(img.storagePath), target: "_blank", rel: "noreferrer" }, "Open the file")),
    el("h3", {}, "Raw record"), el("pre", { class: "raw" }, JSON.stringify(img, null, 2)),
    el("div", { class: "actions-split" },
      el("div", { class: "actions actions--danger" },
        el("span", { class: "danger__label" }, "Danger"),
        // Back to the owner afterwards: this view is a record that no
        // longer exists, and re-rendering it would ask the server for it
        // again and be told it is gone.
        deps.deleteImageButton(img, async () => goMember(deps, img.ownerUid)),
      ),
    ),
  );
}
