// Fills the ProfileViewPreview shell from a ProfileViewModel.
//
// The shell's markup and styles live in the Astro component; this only writes
// text and attributes into it. That split is the same one MemberCard already
// uses for its card preview — one component owns the design, a function binds
// live values into it — so the preview cannot drift from the real rendering.
//
// Variable-length lists are built by cloning the <template> elements the
// component renders. That is deliberate: Astro scopes component CSS by adding a
// `data-astro-cid-*` attribute to every selector, so nodes created from scratch
// in JS would match none of the component's rules. Nodes cloned from a rendered
// template already carry the attribute and style correctly.
//
// The link-shaping rules are imported from links.ts; there is deliberately no
// second copy of them here.
import { href, socialLinks } from "./links.ts";
import type { ProfileViewModel } from "./profileView.ts";

export interface ProfilePreviewLabels {
  /** Shown in place of the name before the member has typed one. */
  defaultName: string;
  /** Prefix for the availability line — the page's own `member.openTo`. */
  openTo: string;
  /** Shown instead of artwork when the gallery is empty. Editor-only text. */
  noWorks: string;
}

export function renderProfilePreview(
  root: HTMLElement,
  vm: ProfileViewModel,
  labels: ProfilePreviewLabels,
): void {
  const part = (name: string) => root.querySelector<HTMLElement>(`[data-ppv="${name}"]`);
  const template = (name: string) =>
    root.querySelector<HTMLTemplateElement>(`[data-ppv-tpl="${name}"]`);

  /** Clone a template's single root element, ready to fill. */
  const clone = (name: string): HTMLElement | null => {
    const tpl = template(name);
    const node = tpl?.content.firstElementChild?.cloneNode(true);
    return node instanceof HTMLElement ? node : null;
  };

  const show = (el: HTMLElement | null, visible: boolean) => {
    if (el) el.hidden = !visible;
  };

  // ── Identity ──────────────────────────────────────────────
  // THE PROFILE PICTURE. Absent from this preview until 2026-09-01, which was
  // the single most visible way it disagreed with the page: the real header is
  // a two-column grid whose first column is the portrait, so a member with one
  // was shown a layout they will never get. The colour behind it is the page's
  // fallback exactly — an avatar that has not decoded yet must not be a hole.
  const avatar = part("avatar") as HTMLImageElement | null;
  if (avatar) {
    const photo = vm.photoURL?.trim() ?? "";
    if (photo) {
      if (avatar.src !== photo) avatar.src = photo;
      avatar.alt = `${vm.displayName || labels.defaultName} — profile picture`;
      avatar.style.backgroundColor = vm.photoColor ?? "var(--color-border)";
    } else {
      avatar.removeAttribute("src");
    }
    show(avatar, Boolean(photo));
  }

  const name = part("name");
  if (name) name.textContent = vm.displayName || labels.defaultName;

  const role = part("role");
  if (role) role.textContent = vm.role;
  show(role, Boolean(vm.role));

  const affiliation = part("affiliation");
  if (affiliation) affiliation.textContent = vm.affiliation;
  show(affiliation, Boolean(vm.affiliation));

  // Location and languages read as one line: "Zurich, Switzerland · DE, EN".
  const where = part("where");
  const languageLabels = vm.languages.map((code) => code.toUpperCase());
  const whereText = [vm.location, languageLabels.join(", ")].filter(Boolean).join(" · ");
  if (where) where.textContent = whereText;
  show(where, Boolean(whereText));

  const open = part("open");
  if (open) open.textContent = `${labels.openTo} ${vm.openTo.join(", ")}`;
  show(open, vm.openTo.length > 0);

  const bio = part("bio");
  if (bio) bio.textContent = vm.bio;
  show(bio, Boolean(vm.bio));

  // ── Tags ──────────────────────────────────────────────────
  const tags = part("tags");
  if (tags) {
    const items = vm.tags.map((t) => {
      const li = clone("val");
      if (li) li.textContent = t;
      return li;
    });
    tags.replaceChildren(...items.filter((n): n is HTMLElement => n !== null));
  }
  show(part("tags-row"), vm.tags.length > 0);

  // ── Looking for ───────────────────────────────────────────
  const needs = part("needs");
  if (needs) {
    const items = vm.visualNeeds.map((need) => {
      const li = clone("val");
      if (li) li.textContent = need;
      return li;
    });
    needs.replaceChildren(...items.filter((n): n is HTMLElement => n !== null));
  }
  show(part("needs-row"), vm.visualNeeds.length > 0);

  // ── Elsewhere ─────────────────────────────────────────────
  // `portfolio` is a plain URL field; `socialMedia` is free text that may hold
  // several comma-joined values, some of which are not links at all.
  const links = part("links");
  const portfolio = vm.portfolio.trim();
  const social = socialLinks(vm.socialMedia.trim());
  if (links) {
    const items: HTMLElement[] = [];

    if (portfolio) {
      const li = clone("link");
      const a = li?.querySelector("a");
      if (li && a) {
        a.href = href(portfolio);
        a.textContent = portfolio;
        items.push(li);
      }
    }

    for (const entry of social) {
      if (entry.href) {
        const li = clone("link");
        const a = li?.querySelector("a");
        if (li && a) {
          a.href = entry.href;
          a.textContent = entry.label;
          items.push(li);
        }
      } else {
        // Not link-shaped (a bare handle, or free text) — show it as text
        // rather than inventing a URL for it.
        const li = clone("val");
        if (li) {
          li.textContent = entry.label;
          items.push(li);
        }
      }
    }

    links.replaceChildren(...items);
  }
  show(part("links-row"), Boolean(portfolio) || social.length > 0);

  // ── Work ──────────────────────────────────────────────────
  const empty = part("works-empty");
  if (empty) empty.textContent = labels.noWorks;

  const works = part("works");
  if (works) {
    const figures = vm.works
      .filter((w) => w.url && w.width > 0 && w.height > 0)
      .map((w) => {
        const figure = clone("work");
        const img = figure?.querySelector("img");
        if (!figure || !img) return null;
        const workPart = (name: string) =>
          figure.querySelector<HTMLElement>(`[data-ppv-work="${name}"]`);

        img.src = w.url;
        img.width = w.width;
        img.height = w.height;
        // A caption is real alt text; without one the image is decorative and
        // an empty alt is the correct, honest value. The description is
        // deliberately NOT used here — a paragraph read before every image is
        // worse for a screen reader than no caption at all.
        img.alt = w.caption?.trim() ?? "";
        // Painted on the image, not on the frame around it — the page writes
        // this inline on <img> too, so a slow upload shows the same colour
        // block in both places.
        img.style.backgroundColor = w.color ?? "var(--color-border)";

        const captionText = w.caption?.trim() ?? "";
        const descText = w.description?.trim() ?? "";

        const caption = workPart("caption");
        if (caption) {
          caption.textContent = captionText;
          caption.hidden = !captionText;
        }

        const desc = workPart("desc");
        if (desc) {
          desc.textContent = descText;
          desc.hidden = !descText;
        }

        show(workPart("caption-block"), Boolean(captionText || descText));
        return figure;
      })
      .filter((n): n is HTMLElement => n !== null);

    works.replaceChildren(...figures);
    show(works, figures.length > 0);
    show(empty, figures.length === 0);
  }
}

/**
 * Fills the CommunityCardPreview shell — the directory card's face — from the
 * same ProfileViewModel. Image face when the gallery has a first item,
 * typographic face otherwise, which is exactly the rule the real grid applies
 * (`hasArtwork`: artwork → image card).
 *
 * The typographic face mirrors CommunityTextCard: a framed rectangle of tag
 * lines, falling back tags → member-type label. The role is NOT part of that
 * chain — it always prints in the caption row, and a frame with nothing to
 * hold becomes a rule (see that component for why).
 * `memberTypeLabels` carries the translated `profile.memberType.*` strings the
 * real card gets from useTranslations() at build time.
 */
export function renderCardPreview(
  root: HTMLElement,
  vm: ProfileViewModel,
  labels: { defaultName: string; memberTypeLabels?: Record<string, string> },
): void {
  const part = (name: string) => root.querySelector<HTMLElement>(`[data-ccpv="${name}"]`);

  const name = part("name");
  if (name) name.textContent = vm.displayName.trim() || labels.defaultName;

  const frame = part("frame");
  const img = part("img") as HTMLImageElement | null;
  const tframe = part("tframe");
  const work = vm.works[0];

  // Same chain as CommunityTextCard's tagLines: tags, else the member-type
  // label, else nothing — the role is not a rung on it.
  const typeLabel = vm.memberType
    ? (labels.memberTypeLabels?.[vm.memberType] ?? vm.memberType)
    : "";
  const role = vm.role.trim();
  const tagLines = vm.tags.length > 0 ? vm.tags : typeLabel ? [typeLabel] : [];
  // A typographic face with nothing for its frame: the real card draws a rule
  // there instead of an empty box, so the shell has to as well.
  const frameIsRule = !work && tagLines.length === 0;

  // The role prints in the caption on every face, always.
  const caption = part("role");
  if (caption) {
    caption.textContent = role;
    caption.hidden = !role;
  }

  if (frame && img) {
    if (work) {
      frame.hidden = false;
      frame.style.aspectRatio = `${work.width} / ${work.height}`;
      frame.style.background = work.color ?? "";
      // Raw Storage URL on purpose: the preview runs in the browser, where
      // the build-time optimiser does not exist. The real card serves
      // getImage() output.
      if (img.src !== work.url) img.src = work.url;
      img.alt = work.caption?.trim() || "";
    } else {
      frame.hidden = true;
      img.removeAttribute("src");
    }
  }

  if (tframe) {
    tframe.hidden = Boolean(work);
    tframe.classList.toggle("ccpv__tframe--rule", frameIsRule);
    const tags = part("tags");
    const tpl = root.querySelector<HTMLTemplateElement>('[data-ccpv-tpl="tag"]');
    if (tags && tpl) {
      // Cloned from the template so each <li> carries the component's
      // data-astro-cid-* attribute — see renderProfilePreview's header note.
      const items = (work ? [] : tagLines).map((line) => {
        const node = tpl.content.firstElementChild?.cloneNode(true);
        if (node instanceof HTMLElement) node.textContent = line;
        return node instanceof HTMLElement ? node : null;
      });
      tags.replaceChildren(...items.filter((n): n is HTMLElement => n !== null));
    }
  }
}
