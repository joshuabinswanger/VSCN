// A WORK'S WIDTH ON THE MEMBER PAGE, IN CSS PIXELS (2026-10-16, Josh:
// "make it possible in the editor to select between S M L for the image size
// width (give them in CSS Pixels) so we can steer a bit how our page looks").
// The one place the numbers live: the page (MemberWork.astro), the editor's
// rows and its preview all write the chosen one as `--size-w` on the figure.
// L is the desktop works column (40rem at the 13px root, --works-w in
// profile.css). A picture is never wider than its column (a phone's is
// ~345px) nor taller than 60vh — profile.css caps both. No Firebase here: the
// static page imports it.

export const WORK_SIZE_PX = { s: 240, m: 380, l: 520 } as const;
export type WorkSize = keyof typeof WORK_SIZE_PX;

/** The size a work is drawn at: its stored one ("s" or "m"), else L. */
export function workSize(item: { size?: string }): WorkSize {
  return item.size === "s" || item.size === "m" ? item.size : "l";
}

/** The figure's `--size-w` value for a work. */
export function workSizeWidth(item: { size?: string }): string {
  return `${WORK_SIZE_PX[workSize(item)]}px`;
}
