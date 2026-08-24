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
// NOTE: the link-shaping rules are imported from proto-links.ts, which still
// lives in the prototype namespace. They graduate together with the profile
// page itself; there is deliberately no second copy of them here.
import { href, socialLinks } from "./proto-links.ts";
import type { ProfileViewModel } from "./profileView.ts";

export interface ProfilePreviewLabels {
  /** Shown in place of the name before the member has typed one. */
  defaultName: string;
  tags: string;
  elsewhere: string;
  /** Prefix for the availability line, e.g. "Open to". */
  openTo: string;
  /** Shown instead of artwork when the gallery is empty. */
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
  const name = part("name");
  if (name) name.textContent = vm.displayName || labels.defaultName;

  const role = part("role");
  if (role) role.textContent = vm.role;
  show(role, Boolean(vm.role));

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
        img.src = w.url;
        img.width = w.width;
        img.height = w.height;
        // A caption is real alt text; without one the image is decorative and
        // an empty alt is the correct, honest value.
        img.alt = w.caption?.trim() ?? "";
        if (w.color) figure.style.background = w.color;
        return figure;
      })
      .filter((n): n is HTMLElement => n !== null);

    works.replaceChildren(...figures);
    show(works, figures.length > 0);
    show(empty, figures.length === 0);
  }
}
