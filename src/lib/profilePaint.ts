// THE MEMBER PAGE PAINTS IN (2026-10-20, Josh: "make an animation that
// paints in the profile page after navigation … name, text, tags and then
// images, so it looks smooth like scrolling on the Portfolios page").
//
// After the arrival pause (Layout.astro holds every arriving page for
// ARRIVE_DELAY_MS; a page that paints in is not faded as a whole) the head
// builds up in the Portfolios cards' own vocabulary: the portrait settles
// in, the name rises word by word out of its line, then every text line in
// page order — role, affiliation, place, the bio's paragraphs, the tag rows,
// the links, a first project's words, the Portfolios pill — drifts up into
// place, and last the first picture opens out of an inset and settles from
// a slight zoom, once it has loaded. Everything after the first picture sits
// still (Josh: "sit still"). The CSS is in profile.css under
// .mprof[data-motion]; the start state applies only under that flag, set
// before the first paint by the page's inline script and never under
// reduced motion, so a visitor without JavaScript sees the page plainly.
import { capped, splitWords, whenHoldDone, whenImageReady, whenIntroDone } from "./entrance.ts";

export const PAINT = {
  /** The first word of the name, after the portrait starts. */
  nameStart: 0.05,
  nameStep: 0.05,
  /** From the last word to the first line. */
  lineGap: 0.08,
  lineStep: 0.055,
  /** From the last line to the picture. */
  pictureGap: 0.12,
  /** A picture that never loads still lets the page in. */
  readyCapMs: 4000,
};

export interface PaintSchedule {
  words: number[];
  lines: number[];
  picture: number;
}

/** The timetable, in seconds from the start: one delay per name word, one
 *  per text line, and the picture's. Pure, so it can be tested. */
export function paintSchedule(nameWords: number, lineCount: number): PaintSchedule {
  const words = Array.from({ length: nameWords }, (_, i) => PAINT.nameStart + i * PAINT.nameStep);
  const lastWord = words.length ? words[words.length - 1] : 0;
  const lines = Array.from({ length: lineCount }, (_, i) => lastWord + PAINT.lineGap + i * PAINT.lineStep);
  const lastLine = lines.length ? lines[lines.length - 1] : lastWord;
  return { words, lines, picture: lastLine + PAINT.pictureGap };
}

/** The text lines of the head, in page order: everything in the aside after
 *  the name, then a first project's words if the first picture is in one,
 *  the index, then the Portfolios pill. */
function headLines(root: HTMLElement, firstWork: HTMLElement | null): HTMLElement[] {
  const lines: HTMLElement[] = [];
  const aside = root.querySelector<HTMLElement>(".mprof__aside");
  if (aside) {
    lines.push(
      ...aside.querySelectorAll<HTMLElement>(
        ".mprof__head-copy > :not(.mprof__name), .mprof__bio .mprof__para, .mprof__meta > .mprof__row",
      ),
    );
  }
  // The words of the project the first picture sits in: the project's head
  // and text blocks that come before that picture, and only those.
  const project = firstWork?.closest<HTMLElement>(".mprof__project");
  if (project && firstWork) {
    for (const child of Array.from(project.children) as HTMLElement[]) {
      if (child === firstWork || child.contains(firstWork)) break;
      lines.push(child);
    }
  }
  const index = root.querySelector<HTMLElement>(".mprof__index");
  if (index) lines.push(index);
  const bar = document.querySelector<HTMLElement>(".mprof-bar");
  if (bar) lines.push(bar);
  return lines;
}

/** Stamps the schedule on the page: the portrait, the name's word masks,
 *  each line's and the first picture's `--d`. Returns the first picture's
 *  img, which the play waits for. */
export function preparePaint(root: HTMLElement): HTMLImageElement | null {
  const name = root.querySelector<HTMLElement>(".mprof__name");
  const wordCount = (name?.textContent ?? "").trim().split(/\s+/).filter(Boolean).length;
  const firstWork = root.querySelector<HTMLElement>(".mprof__works .mprof__work");
  const lines = headLines(root, firstWork);
  const schedule = paintSchedule(wordCount, lines.length);
  const avatar = root.querySelector<HTMLElement>(".mprof__avatar");
  if (avatar) avatar.dataset.paint = "avatar";
  splitWords(name, schedule.words);
  lines.forEach((line, i) => {
    line.dataset.paint = "line";
    line.style.setProperty("--d", `${schedule.lines[i].toFixed(3)}s`);
  });
  if (firstWork) {
    firstWork.dataset.paint = "picture";
    firstWork.style.setProperty("--d", `${schedule.picture.toFixed(3)}s`);
  }
  root.setAttribute("data-painted", "");
  return firstWork?.querySelector<HTMLImageElement>(".mprof__img") ?? null;
}

/** Plays the paint-in once the page may be seen: after the intro on a full
 *  load, after the arrival pause on a swap, with the fonts and the first
 *  picture ready (capped). */
export async function paintIn(root: HTMLElement | null): Promise<void> {
  if (!root || !root.hasAttribute("data-motion")) return;
  const img = preparePaint(root);
  const ready = (async () => {
    await whenIntroDone();
    await whenHoldDone();
    await document.fonts?.ready.catch(() => {});
    await whenImageReady(img);
  })();
  await capped(ready, PAINT.readyCapMs);
  if (!root.isConnected) return;
  root.classList.add("is-in");
  document.querySelector(".mprof-bar")?.classList.add("is-in");
}

/** Shows the page plainly, with no build-up — for an arrival the browser
 *  animated itself (the iOS swipe back), where the page is already on
 *  screen when the script runs. */
export function paintPlainly(root: HTMLElement | null): void {
  root?.removeAttribute("data-motion");
  document.querySelector(".mprof-bar")?.removeAttribute("data-motion");
}
