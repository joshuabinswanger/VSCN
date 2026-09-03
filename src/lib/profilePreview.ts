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
// The card preview drives the DIRECTORY CARD'S OWN carousel now, not a still
// picture that looks like one -- see renderCardPreview below and the header of
// src/lib/communityCarousel.ts.
import { destroyCarousel, initCarousels } from "./communityCarousel.ts";
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
 * Labels renderCardPreview() needs that the shell cannot carry itself. The
 * card gets these from useTranslations() at build time; the preview is filled
 * in the browser, so they have to arrive as values.
 *
 * The carousel ones are optional and default to nothing: a missing label costs
 * an aria attribute, never the paging.
 */
export interface CardPreviewLabels {
  /** Shown in place of the name before the member has typed one. */
  defaultName: string;
  /** The translated `profile.memberType.*` strings, for the typographic face. */
  memberTypeLabels?: Record<string, string>;
  /** `community.card.carousel` — the frame's aria-roledescription. */
  carousel?: string;
  /** `community.card.image` — each slide's aria-roledescription. */
  image?: string;
  /** `community.card.gallery` — completes the frame's accessible name. */
  gallery?: string;
  /** `community.card.imagePosition`, with {n} and {total} placeholders. */
  imagePosition?: string;
  /** `community.card.prev` / `community.card.next` — the arrows' labels. */
  prev?: string;
  next?: string;
  /** `member.workAlt` — the alt-text fallback for an uncaptioned image. */
  workAlt?: string;
}

/** "Image 2 of 3" from the translated template. Empty when there is none. */
function position(template: string | undefined, index: number, total: number): string {
  if (!template) return "";
  return template.replace("{n}", String(index + 1)).replace("{total}", String(total));
}

/**
 * Fills the CommunityCardPreview shell — the directory card, from the same
 * ProfileViewModel. Image face when the gallery has anything in it,
 * typographic face otherwise, which is exactly the rule the real grid applies
 * (`hasArtwork`: artwork → image card).
 *
 * THE CAROUSEL IS THE REAL ONE (2026-09-02, Josh: "carousel shouls be the same
 * elemnt in preview as well"). The shell is the card's own markup now (see
 * CommunityCardPreview) and the paging is the card's own module, so this
 * function's job on the image face is to build the track's slides and hand the
 * frame to initCarousels(). It used to bind ONE image into a frame of its own
 * design, which is why a member with six pictures was previewing a card that
 * could only ever show the first.
 *
 * The typographic face mirrors CommunityTextCard: a framed rectangle of tag
 * lines, falling back tags → member-type label. The role is NOT part of that
 * chain — it always prints in the caption row, and a frame with nothing to
 * hold becomes a rule (see that component for why).
 */
export function renderCardPreview(
  root: HTMLElement,
  vm: ProfileViewModel,
  labels: CardPreviewLabels,
): void {
  const part = (name: string) => root.querySelector<HTMLElement>(`[data-ccpv="${name}"]`);
  const clone = (name: string): HTMLElement | null => {
    const tpl = root.querySelector<HTMLTemplateElement>(`[data-ccpv-tpl="${name}"]`);
    const node = tpl?.content.firstElementChild?.cloneNode(true);
    return node instanceof HTMLElement ? node : null;
  };
  const show = (el: HTMLElement | null, visible: boolean) => {
    if (el) el.hidden = !visible;
  };
  /** Sets an attribute, or removes it when there is no value — a stale aria
   *  label left over from a previous render is worse than none. */
  const attr = (el: Element | null, name: string, value: string) => {
    if (!el) return;
    if (value) el.setAttribute(name, value);
    else el.removeAttribute(name);
  };

  const displayName = vm.displayName.trim() || labels.defaultName;
  const nameEl = part("name");
  if (nameEl) nameEl.textContent = displayName;

  // Same filter the profile-page preview applies: a gallery item mid-upload has
  // no dimensions yet, and a slide with no aspect is a collapsed frame.
  const works = vm.works.filter((w) => w.url && w.width > 0 && w.height > 0);
  const first = works[0];
  const isCarousel = works.length > 1;

  // Same chain as CommunityTextCard's tagLines: tags, else the member-type
  // label, else nothing — the role is not a rung on it.
  const typeLabel = vm.memberType
    ? (labels.memberTypeLabels?.[vm.memberType] ?? vm.memberType)
    : "";
  const tagLines = vm.tags.length > 0 ? vm.tags : typeLabel ? [typeLabel] : [];
  // A typographic face with nothing for its frame: the real card draws a rule
  // there instead of an empty box, so the shell has to as well.
  const frameIsRule = !first && tagLines.length === 0;

  // The role prints in the caption on every face, always.
  const role = vm.role.trim();
  const roleEl = part("role");
  if (roleEl) roleEl.textContent = role;
  show(roleEl, Boolean(role));

  // ── The image face ────────────────────────────────────────
  const frame = part("frame");
  const track = part("track");
  show(part("body"), Boolean(first));

  if (frame && track) {
    if (first) {
      // The card's width formula reads this off the root; without it tall
      // artwork fills the preview's measure instead of narrowing to fit.
      root.style.setProperty("--frame-ar", String(first.width / first.height));
      frame.style.aspectRatio = `${first.width} / ${first.height}`;
      frame.style.background = first.color ?? "";

      // ONLY WHEN THE GALLERY ITSELF CHANGED. renderCardPreview runs on every
      // keystroke in the form — the name, the role, a tag — and rebuilding the
      // track each time would destroy the Embla instance, throw the member
      // back to image 1 and re-decode every picture while they type. The
      // signature covers the images AND the text bound into them, so a caption
      // edit still lands.
      const signature = works
        .map(
          (w) =>
            `${w.url}|${w.width}x${w.height}|${w.caption ?? ""}|${w.descriptionShort ?? ""}`
        )
        .join("~");
      if (frame.dataset.ccpvSignature !== signature) {
        frame.dataset.ccpvSignature = signature;
        // Release the previous carousel before its slides go: dropping the
        // nodes leaves Embla's observers and its 5s timer alive against
        // detached elements (see destroyCarousel).
        destroyCarousel(frame);

        const slides = works
          .map((w, i) => {
            const slide = clone("slide");
            const img = slide?.querySelector("img");
            if (!slide || !img) return null;

            // A REAL src on every slide, not the card's data-src scheme: this
            // runs in the browser where the build-time optimiser does not
            // exist, and one member's gallery is eight images at most. The
            // card serves getImage() output and defers the rest.
            img.src = w.url;
            img.width = w.width;
            img.height = w.height;
            // The card's rule exactly: the member's caption when they wrote
            // one, a translated fallback otherwise — never "".
            img.alt = w.caption?.trim() || `${displayName} — ${labels.workAlt ?? ""}`.trim();
            if (w.color) img.style.background = w.color;

            // What communityCarousel.ts copies onto the frame's trigger as the
            // carousel moves. The preview's trigger is href-less so the URL is
            // ignored there; the rest is written anyway, which keeps the shell
            // speaking the card's whole contract rather than a convenient half.
            slide.dataset.workUrl = w.url;
            slide.dataset.workWidth = String(w.width);
            slide.dataset.workHeight = String(w.height);
            if (w.caption?.trim()) slide.dataset.workCaption = w.caption.trim();
            // THE SHORT LINE, matching the card: the slide dataset is what a
            // real card copies onto its lightbox trigger, and the lightbox
            // gets the sentence, not the essay (see profileView.ts).
            if (w.descriptionShort) slide.dataset.workDescription = w.descriptionShort;

            // A single picture is not a carousel: no group semantics, no
            // position label. Calling one image a carousel would be a lie to a
            // screen reader — the card's own reasoning, and its own markup.
            if (isCarousel) {
              slide.setAttribute("role", "group");
              attr(slide, "aria-roledescription", labels.image ?? "");
              attr(slide, "aria-label", position(labels.imagePosition, i, works.length));
              if (i !== 0) slide.setAttribute("aria-hidden", "true");
            }
            return slide;
          })
          .filter((n): n is HTMLElement => n !== null);
        track.replaceChildren(...slides);

        // The dots live on the CARD, above the frame — one per work, and none
        // at all for a gallery of one.
        const dots = part("dots");
        if (dots) {
          const marks = (isCarousel ? works : [])
            .map((_, i) => {
              const dot = clone("dot");
              if (dot && i === 0) dot.classList.add("ccard__dot--on");
              return dot;
            })
            .filter((n): n is HTMLElement => n !== null);
          dots.replaceChildren(...marks);
        }
        show(dots, isCarousel);

        if (isCarousel) {
          frame.setAttribute("role", "group");
          attr(frame, "aria-roledescription", labels.carousel ?? "");
          attr(frame, "aria-label", labels.gallery ? `${displayName} — ${labels.gallery}` : "");
          // Read by the module to rebuild the live region on every move.
          attr(frame, "data-position-label", labels.imagePosition ?? "");
        } else {
          frame.removeAttribute("role");
          frame.removeAttribute("aria-roledescription");
          frame.removeAttribute("aria-label");
          frame.removeAttribute("data-position-label");
        }

        const prev = part("prev");
        const next = part("next");
        attr(prev, "aria-label", labels.prev ?? "");
        attr(next, "aria-label", labels.next ?? "");
        show(prev, isCarousel);
        show(next, isCarousel);

        // Scoped to this root, so a page holding more than one preview wires
        // only the one that changed. A no-op for a gallery of one — which is
        // what the card does with a single work too.
        initCarousels(root);
      }
    } else {
      // No artwork: the slides go, and the carousel with them. An eight-image
      // track left behind a hidden body would keep its timer and its observers
      // running over pictures nobody can see.
      destroyCarousel(frame);
      delete frame.dataset.ccpvSignature;
      track.replaceChildren();
      root.style.removeProperty("--frame-ar");
      show(part("dots"), false);
    }
  }

  // ── The typographic face ──────────────────────────────────
  const tframe = part("tframe");
  if (tframe) {
    tframe.hidden = Boolean(first);
    tframe.classList.toggle("ccpv__tframe--rule", frameIsRule);
    const tags = part("tags");
    if (tags) {
      const items = (first ? [] : tagLines)
        .map((line) => {
          const node = clone("tag");
          if (node) node.textContent = line;
          return node;
        })
        .filter((n): n is HTMLElement => n !== null);
      tags.replaceChildren(...items);
    }
  }
}
