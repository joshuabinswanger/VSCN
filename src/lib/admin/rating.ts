/**
 * THE MODERATION STACK — one picture at a time, four sliders, three verbs.
 *
 * Rating a hundred pictures is a sitting, not a hundred sittings, so this view
 * is built for a keyboard: `0`–`5` set the focused slider, Tab walks them,
 * Enter saves and advances, `s` skips, `h` hides.
 *
 * THREE THINGS HERE ARE LOAD-BEARING AND EASY TO UNDO BY ACCIDENT:
 *
 * 1. The three human sliders start UNSET, at a sentinel position below the
 *    scale. A range input has no "no value" state, and starting one at 3 would
 *    have every untouched picture quietly rated 3 by an admin who only meant
 *    to look at it. Save stays disabled until all three have left the sentinel,
 *    and the sentinel can never be sent.
 *
 * 2. The number the panel shows is computed by imageScore() — the SAME module
 *    functions/src/moderation.ts uses. It is not re-derived here. If the shown
 *    number and the stored number can differ, the panel lies about what the
 *    button is about to do, which is the worst outcome this view has.
 *
 * 3. Completeness starts at the record's computed reading, marked `auto`, and
 *    an untouched slider sends `null` rather than that number. `null` means
 *    "follow the record", so a member who adds a German description next month
 *    lifts their own score with nobody re-rating anything. Sending the number
 *    would freeze it.
 *
 * See documentation/20260922-image-moderation-ranking-design.md.
 */
import type {
  RateImageRequest, RatingQueueItem, SetImageHiddenRequest,
} from "../adminApi.ts";
import { imageScore } from "../imageScore.ts";
import { type Child, type Reporter, el, fmt, linkBtn } from "./dom.ts";

/** The three an admin judges. Completeness is the fourth and is handled apart. */
const CRITERIA = [
  { key: "professional", label: "Professional work", hint: "Is this professional work?" },
  { key: "knowledge", label: "Knowledge communication", hint: "Is the subject knowledge communication?" },
  { key: "aesthetics", label: "Aesthetics", hint: "Is it good to look at?" },
] as const;
type HumanKey = (typeof CRITERIA)[number]["key"];

/** The five checks, in the order completenessChecks() returns them. */
const CHECK_LABELS: { key: keyof RatingQueueItem["checks"]; label: string }[] = [
  { key: "caption", label: "caption" },
  { key: "description", label: "description" },
  { key: "german", label: "German (both)" },
  { key: "tags", label: "tags" },
  { key: "link", label: "link" },
];

/**
 * The slider position that means "not rated". Below the scale, so it is
 * unreachable by any legal value and a rating of 0 stays expressible — an
 * admin who genuinely means zero must be able to say so.
 */
const UNSET = -1;

export interface RatingDeps extends Reporter {
  /** A viewable URL for a stored image. */
  fileUrl(storagePath: string): string;
  crumbs(...extra: Child[]): HTMLElement;
  go(hash: string): void;
  /**
   * The two privileged verbs, injected rather than imported, so
   * /proto/admin-preview can drive the whole panel without a credential and
   * without a callable ever being reached.
   */
  rate(req: RateImageRequest): Promise<{ ok: true; score: number }>;
  hide(req: SetImageHiddenRequest): Promise<{ ok: true }>;
}

export interface RatingPanel {
  /** Put a freshly fetched queue on screen. */
  render(items: RatingQueueItem[], remaining: number): void;
  /** The view's keyboard. Returns true when it consumed the event. */
  handleKey(event: KeyboardEvent): boolean;
}

/**
 * AdminConsole's `typing` guard with the one exception it cannot make for
 * itself: a range input IS an `<input>`, and every shortcut in this view is
 * pressed with a range focused. Text entry still swallows them, which is the
 * point of the guard — the console's filter box is one Tab away.
 */
export function isTextEntry(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null;
  if (!t) return false;
  if (t.isContentEditable) return true;
  if (t.tagName === "TEXTAREA" || t.tagName === "SELECT") return true;
  return t.tagName === "INPUT" && (t as HTMLInputElement).type !== "range";
}

export function createRatingPanel(host: HTMLElement, deps: RatingDeps): RatingPanel {
  /** Work still to do in this pass. The head of it is what is on screen. */
  let stack: RatingQueueItem[] = [];
  /** What the server said was outstanding, before its own `limit`. */
  let outstanding = 0;
  /**
   * SKIPS LIVE IN MEMORY, FOR THIS SESSION ONLY. Nothing is written when an
   * admin passes on a picture, so a reload brings it back — no image can
   * become permanently invisible because somebody once was not sure.
   */
  let skipped: RatingQueueItem[] = [];

  let human: Record<HumanKey, number> = { professional: UNSET, knowledge: UNSET, aesthetics: UNSET };
  let completeness = 0;
  let completenessAuto = true;
  /** One call at a time: Enter repeats faster than a callable answers. */
  let working = false;

  const ranges = new Map<string, HTMLInputElement>();
  /** Repaint a slider's readout after a value set that did not come from the user. */
  const painters = new Map<string, () => void>();
  let saveBtn: HTMLButtonElement | null = null;
  let scoreNode: HTMLElement | null = null;

  const current = (): RatingQueueItem | null => stack[0] ?? null;
  const allSet = (): boolean => CRITERIA.every((c) => human[c.key] !== UNSET);

  /**
   * The number the panel shows, from the one arithmetic. It is the score of
   * THIS admin's rating standing alone; where other admins have already
   * rated, the stored score is the average of theirs and this one, and the
   * queue deliberately does not carry their numbers (it reports how many, not
   * which). So the panel says which of the two it is showing rather than
   * presenting one as the other — see the note beside `raterCount` below.
   */
  function preview(item: RatingQueueItem): number | null {
    if (!allSet()) return null;
    return imageScore(item, {
      ratings: {
        me: {
          professional: human.professional,
          knowledge: human.knowledge,
          aesthetics: human.aesthetics,
          completeness: completenessAuto ? null : completeness,
        },
      },
    });
  }

  function refresh(): void {
    const item = current();
    if (!item || !scoreNode || !saveBtn) return;
    const n = preview(item);
    scoreNode.textContent = n === null ? "—" : String(n);
    scoreNode.classList.toggle("rate__score-n--pending", n === null);
    saveBtn.disabled = working || !allSet();
    saveBtn.title = allSet() ? "" : "Move all three sliders first — an unrated criterion is not a 3.";
  }

  /** A range plus its readout. `value === UNSET` renders as a dash, never a number. */
  function slider(
    key: string, label: string, hint: string, value: number, auto: boolean, onChange: (v: number) => void,
    extra?: Child,
  ): HTMLElement {
    const id = `rate-${key}`;
    const readout = el("output", { class: "rate__val", for: id });
    const input = el("input", {
      type: "range", id, class: "rate__range",
      min: String(auto ? 0 : UNSET), max: "5", step: "1", value: String(value),
      "aria-describedby": `${id}-hint`,
    });
    const paint = () => {
      const v = Number(input.value);
      readout.textContent = v === UNSET ? "—" : String(v);
      input.setAttribute("aria-valuetext", v === UNSET ? "not rated" : String(v));
      input.classList.toggle("rate__range--unset", v === UNSET);
      // The inked fraction of the track. Written here rather than read by
      // CSS because no engine exposes a range's progress the same way; an
      // unset slider inks nothing, whatever its thumb position.
      const lo = Number(input.min), hi = Number(input.max);
      const p = v === UNSET ? 0 : ((v - lo) / (hi - lo)) * 100;
      input.style.setProperty("--p", `${p}%`);
    };
    input.addEventListener("input", () => {
      paint();
      onChange(Number(input.value));
    });
    paint();
    ranges.set(key, input);
    painters.set(key, paint);
    return el("div", { class: "rate__crit" },
      el("label", { class: "rate__crit-label", for: id }, label),
      input,
      readout,
      el("span", { class: "rate__crit-extra" }, extra),
      // Still the range's description for a screen reader; no longer a line of
      // print under every track. The label is the question.
      el("span", { id: `${id}-hint`, class: "rate__sr" }, hint));
  }

  function checklist(item: RatingQueueItem): HTMLElement {
    // SHOWN, NOT RATED: it says WHY completeness reads what it does, so an
    // override is an informed disagreement rather than a guess.
    // Pills, so all five sit on one line of the side column. The mark says
    // present/missing to the eye; the words say it to a screen reader.
    return el("ul", { class: "rate__checks" },
      ...CHECK_LABELS.map(({ key, label }) => {
        const ok = item.checks[key];
        return el("li", { class: `rate__check${ok ? " rate__check--yes" : " rate__check--no"}` },
          el("span", { class: "rate__check-mark", "aria-hidden": "true" }, ok ? "✓" : "✗"),
          label,
          el("span", { class: "rate__sr" }, ok ? " present" : " missing"));
      }));
  }

  function meta(item: RatingQueueItem): HTMLElement {
    const linkRow = (label: string, href: string | undefined) =>
      href ? el("p", { class: "rate__meta-row" },
        el("span", { class: "muted small" }, `${label} `),
        el("a", { href, target: "_blank", rel: "noreferrer" }, href)) : null;
    return el("div", { class: "rate__meta" },
      el("p", { class: "rate__owner" },
        linkBtn(item.ownerName || item.ownerUid, () => deps.go(`#uid/${encodeURIComponent(item.ownerUid)}`)),
        item.ownerSlug ? el("span", { class: "muted small" }, ` · /members/${item.ownerSlug}`) : null),
      el("p", { class: "rate__caption" }, item.caption || "— no caption —"),
      item.description ? el("p", { class: "rate__desc" }, item.description) : null,
      item.captionDe || item.descriptionDe
        ? el("p", { class: "muted small" }, `DE: ${item.captionDe ?? "—"} · ${item.descriptionDe ?? "—"}`)
        : null,
      el("div", { class: "rate__facts" },
        item.tags.length
          ? el("span", { class: "chips" }, ...item.tags.map((t) => el("span", { class: "tag" }, t)))
          : el("span", { class: "muted small" }, "no tags"),
        el("span", { class: "muted small" }, `${fmt(item.createdAt)} · ${item.width}×${item.height}`)),
      linkRow("link", item.link),
      linkRow("own page", item.siteLink),
      el("div", { class: "rate__complete" },
        el("span", { class: "rate__complete-label" }, `Completeness ${item.computedCompleteness}/5`),
        checklist(item)),
      // An admin joining an average should know they are joining one. The
      // panel's live number is this admin's own rating; the stored score will
      // be the mean of it and the ratings already there.
      item.raterCount > 0
        ? el("p", { class: "note" },
          `${item.raterCount} other rating${item.raterCount === 1 ? "" : "s"} already — current score ${item.score}. `
          + "Yours is averaged in, so the stored score will land between the two.")
        : null,
      item.hidden ? el("p", { class: "note note--diff" }, "Hidden from the galleries.") : null);
  }

  /** The stack is empty: say why, and offer the skips back. */
  function renderDone(): HTMLElement {
    return el("div", { class: "card" },
      deps.crumbs(),
      el("h2", {}, "Moderation"),
      el("p", {}, skipped.length
        ? `Nothing left in this pass. ${skipped.length} skipped.`
        : "Nothing left to rate. Every live gallery image carries your rating."),
      skipped.length
        ? el("div", { class: "actions" },
          linkBtn(`Go through the ${skipped.length} skipped again`, () => {
            stack = skipped;
            skipped = [];
            draw();
          }, "btn-ghost"))
        : null);
  }

  function draw(): void {
    ranges.clear();
    painters.clear();
    saveBtn = null;
    scoreNode = null;
    const item = current();
    if (!item) {
      host.replaceChildren(renderDone());
      return;
    }

    human = { professional: UNSET, knowledge: UNSET, aesthetics: UNSET };
    completeness = item.computedCompleteness;
    completenessAuto = true;

    const autoTag = el("span", { class: "rate__auto" }, "auto");
    const revert = el("button", { type: "button", class: "btn-link rate__revert", hidden: "", title: "Back to the computed value" }, "↺ auto");
    revert.addEventListener("click", () => {
      // Put the slider back WITHOUT firing its input handler — that handler's
      // job is to record a disagreement, and this is the opposite gesture.
      const range = ranges.get("completeness");
      if (range) range.value = String(item.computedCompleteness);
      painters.get("completeness")?.();
      completeness = item.computedCompleteness;
      completenessAuto = true;
      autoTag.hidden = false;
      revert.hidden = true;
      refresh();
    });

    scoreNode = el("strong", { class: "rate__score-n" }, "—");
    saveBtn = el("button", { type: "button", class: "btn-solid" }, "Save & next");
    saveBtn.addEventListener("click", () => void save());
    const skipBtn = el("button", { type: "button", class: "btn-ghost" }, "Skip");
    skipBtn.addEventListener("click", () => skip());
    const hideBtn = el("button", { type: "button", class: "btn-ghost btn-danger" },
      item.hidden ? "Unhide from galleries" : "Hide from galleries");
    hideBtn.addEventListener("click", () => void toggleHidden());

    // ONE SCREEN: the picture is a stage on the left, and everything the
    // admin reads and moves is one column beside it — record, sliders, score,
    // Save. The sliders used to sit under the picture and began below the
    // fold of a 16" laptop; see the stylesheet's note on .rate.
    const kbd = (k: string) => el("kbd", {}, k);
    host.replaceChildren(el("div", { class: "card rate" },
      el("div", { class: "rate__head" },
        el("h2", {}, "Moderation"),
        el("span", { class: "muted small" },
          `${stack.length} in this pass · ${outstanding} unrated by you`),
        deps.crumbs()),
      el("div", { class: "rate__body" },
        el("figure", { class: "rate__stage" },
          el("img", {
            class: "rate__img", src: deps.fileUrl(item.storagePath), alt: item.caption ?? "",
            loading: "eager", decoding: "async",
          })),
        el("div", { class: "rate__side" },
          meta(item),
          el("div", { class: "rate__sliders" },
            ...CRITERIA.map((c) => slider(c.key, c.label, c.hint, UNSET, false, (v) => {
              human[c.key] = v;
              refresh();
            })),
            slider("completeness", "Completeness", "Computed from the record — move it only to disagree.",
              item.computedCompleteness, true, (v) => {
                completeness = v;
                completenessAuto = false;
                autoTag.hidden = true;
                revert.hidden = false;
                refresh();
              }, [autoTag, revert])),
          el("div", { class: "rate__score" },
            el("span", { class: "muted small" }, "score"), scoreNode),
          el("div", { class: "rate__actions" },
            saveBtn,
            el("div", { class: "rate__actions-row" }, skipBtn, hideBtn),
            el("p", { class: "rate__keys" },
              kbd("1"), "–", kbd("5"), " rate · ", kbd("Tab"), " next · ", kbd("Enter"), " save · ",
              kbd("S"), " skip · ", kbd("H"), " hide")))),
    ));
    refresh();
    // Straight onto the first slider: the whole view is a keyboard.
    ranges.get("professional")?.focus();
  }

  /** Off the head of the stack and on to the next picture. */
  function advance(): void {
    stack = stack.slice(1);
    outstanding = Math.max(0, outstanding - 1);
    draw();
  }

  async function save(): Promise<void> {
    const item = current();
    if (!item || working || !allSet()) return;
    const req: RateImageRequest = {
      imageId: item.imageId,
      professional: human.professional,
      knowledge: human.knowledge,
      aesthetics: human.aesthetics,
      // `null`, not the number, unless the admin actually moved it.
      completeness: completenessAuto ? null : completeness,
    };
    working = true;
    refresh();
    const res = await deps.busy("Saving rating…", () => deps.rate(req));
    working = false;
    // A FAILED SAVE MUST NOT ADVANCE THE STACK. busy() reports the error and
    // resolves undefined; the picture stays on screen with the sliders as the
    // admin left them, so the judgement is not lost to a dropped request.
    if (res === undefined) {
      refresh();
      return;
    }
    deps.say(`Rated ${item.imageId} · score ${res.score}.`, "success");
    advance();
  }

  function skip(): void {
    const item = current();
    if (!item || working) return;
    skipped = [...skipped, item];
    stack = stack.slice(1);
    draw();
  }

  async function toggleHidden(): Promise<void> {
    const item = current();
    if (!item || working) return;
    const hidden = !item.hidden;
    working = true;
    refresh();
    const res = await deps.busy(hidden ? "Hiding…" : "Unhiding…",
      () => deps.hide({ imageId: item.imageId, hidden }));
    working = false;
    if (res === undefined) {
      refresh();
      return;
    }
    deps.say(hidden
      ? `${item.imageId} is off the galleries. It is still on the member's own page.`
      : `${item.imageId} is back on the galleries.`, "success");
    // Hiding is not a rating: the picture leaves this pass without one, and
    // comes back in the next queue if it is still unrated.
    stack = stack.slice(1);
    draw();
  }

  return {
    render(items, remaining) {
      stack = items;
      outstanding = remaining;
      skipped = [];
      draw();
    },
    handleKey(event) {
      if (!current() || isTextEntry(event.target)) return false;
      const focused = document.activeElement;
      if (/^[0-5]$/.test(event.key) && focused instanceof HTMLInputElement && focused.type === "range") {
        focused.value = event.key;
        focused.dispatchEvent(new Event("input"));
        return true;
      }
      if (event.key === "Enter") { void save(); return true; }
      if (event.key === "s" || event.key === "S") { skip(); return true; }
      if (event.key === "h" || event.key === "H") { void toggleHidden(); return true; }
      return false;
    },
  };
}
