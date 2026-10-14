// THE GALLERY CARD'S FOLD, ANIMATED (2026-10-14, Josh: "a sooper smooth
// animation on closing and opening the side bar").
//
// The words column is a native <details> (MemberDetailPanel, column mode).
// A native toggle is instant: the browser swaps `open` and the content is
// simply there or not, and the CSS route to a tween (::details-content with
// interpolate-size) is Chromium-only — it would leave an iPhone, where Josh
// looks first, with the same snap. So the fold is driven here with the Web
// Animations API, which every engine has, and the <details> stays the source
// of truth: `open` is still what the CSS, the keyboard and a screen reader
// read.
//
// THE ORDER OF THINGS. Opening sets `open` first and then plays the words in
// (their box grows from nothing, the text rises into it a beat later, the
// foot follows). Closing is the reverse, and `open` is only removed once the
// last frame has played — until then the class `is-closing` stands in for
// "folded" wherever the CSS needs the new state early (the rail's chevron).
// Every animation is DECORATION on top of a state the stylesheet already
// states fully, so cancelling one at any point lands on a correct card.
//
// No script, no animation: without this module the summary still toggles, only
// instantly. Registered once, on the document, so a ClientRouter navigation
// has nothing to tear down or re-run.

const PHONE = "(max-width: 767px)";
const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";
const OPEN_MS = 520;
const CLOSE_MS = 360;

const running = new WeakMap<HTMLDetailsElement, Animation[]>();

/** What stands outside the panel and goes with it: the whole foot (count and
 *  Profile link) on a desktop, only the Profile link on a phone, where the
 *  count is always shown. */
function outsideTargets(details: HTMLDetailsElement): HTMLElement[] {
  const card = details.closest<HTMLElement>(".ccard");
  if (!card) return [];
  const phone = matchMedia(PHONE).matches;
  const el = card.querySelector<HTMLElement>(
    phone ? ":scope > .ccard__foot > .ccard__profile" : ":scope > .ccard__foot"
  );
  return el ? [el] : [];
}

function toggle(details: HTMLDetailsElement): void {
  const body = details.querySelector<HTMLElement>(":scope > .pdisc__body");
  const inner = body?.firstElementChild as HTMLElement | null | undefined;
  const opening = !details.open || details.classList.contains("is-closing");

  if (!body || !inner || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    details.open = opening;
    details.classList.remove("is-closing");
    return;
  }

  // Where a reversal starts from: wherever the interrupted run had got to.
  const busy = running.get(details);
  const startH = body.getBoundingClientRect().height;
  const startOpacity = busy ? parseFloat(getComputedStyle(inner).opacity) : opening ? 0 : 1;
  busy?.forEach((a) => a.cancel());

  details.classList.toggle("is-closing", !opening);
  if (opening) details.open = true;

  // The panel's natural height and the margin the open state gives it (a phone
  // opens it 12px under the head; animating the margin keeps that from being a
  // jump of its own).
  const naturalH = body.getBoundingClientRect().height;
  const openMargin = parseFloat(getComputedStyle(body).marginTop) || 0;
  const fromH = opening ? (busy ? startH : 0) : busy ? startH : naturalH;
  const toH = opening ? naturalH : 0;
  const share = naturalH > 0 ? fromH / naturalH : 0;
  const fromMargin = openMargin * share;
  const toMargin = opening ? openMargin : 0;

  const ms = opening ? OPEN_MS : CLOSE_MS;
  body.style.overflow = "hidden";
  const anims: Animation[] = [
    body.animate(
      { height: [`${fromH}px`, `${toH}px`], marginTop: [`${fromMargin}px`, `${toMargin}px`] },
      { duration: ms, easing: EASE, fill: "both" }
    ),
    // The words rise into their box a beat after it starts opening, and leave
    // first when it closes — so the box never shows text crowded into a
    // sliver of itself.
    inner.animate(
      opening
        ? [
            { opacity: startOpacity, transform: `translateY(${(1 - startOpacity) * -0.6}rem)` },
            { opacity: 1, transform: "translateY(0)" },
          ]
        : [
            { opacity: startOpacity, transform: "translateY(0)" },
            { opacity: 0, transform: "translateY(-0.4rem)" },
          ],
      opening
        ? { duration: ms - 120, delay: 120, easing: EASE, fill: "both" }
        : { duration: ms * 0.6, easing: "ease-in", fill: "both" }
    ),
  ];
  for (const el of outsideTargets(details)) {
    const from = busy ? parseFloat(getComputedStyle(el).opacity) : opening ? 0 : 1;
    anims.push(
      el.animate(
        { opacity: opening ? [from, 1] : [from, 0] },
        opening
          ? { duration: ms - 200, delay: 200, easing: EASE, fill: "both" }
          : { duration: ms * 0.5, easing: "ease-in", fill: "both" }
      )
    );
  }
  running.set(details, anims);

  const finish = () => {
    if (running.get(details) !== anims) return; // superseded by a newer click
    running.delete(details);
    if (!opening) {
      details.open = false;
      details.classList.remove("is-closing");
    }
    anims.forEach((a) => a.cancel());
    body.style.overflow = "";
  };
  Promise.all(anims.map((a) => a.finished)).then(finish, () => {
    /* cancelled by a newer click, which owns the cleanup */
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || !(e.target instanceof Element)) return;
    const summary = e.target.closest("details.pdisc--column > summary");
    const details = summary?.parentElement;
    if (!(details instanceof HTMLDetailsElement)) return;
    e.preventDefault();
    toggle(details);
  });
}
