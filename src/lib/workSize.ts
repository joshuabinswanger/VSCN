// A WORK'S WIDTH ON THE MEMBER PAGE, IN CSS PIXELS (2026-10-16, Josh:
// "make it possible in the editor to select between S M L for the image size
// width (give them in CSS Pixels) so we can steer a bit how our page looks").
// TWO SIZES SINCE 2026-10-23 (Josh: "only make a Small and Large size for the
// images with a big enough gap"): S and L, L the desktop works column (48rem
// at the 13px root, --works-w in profile.css), S less than half of it. The
// one place the numbers live: the page (MemberWork.astro), the editor's rows
// and its preview all write the chosen one as `--size-w` on the figure. A
// record that still says "m" (the middle size of 2026-10-16 to 10-23) is
// drawn at S; the stored value is left alone until the work is next saved.
// A picture is never wider than its column (a phone's is ~345px) nor taller
// than 70vh — profile.css caps both. No Firebase here: the static page
// imports it.

export const WORK_SIZE_PX = { s: 288, l: 624 } as const;
export type WorkSize = keyof typeof WORK_SIZE_PX;

/** The size a work is drawn at: S for a stored "s" (or the retired "m"), else L. */
export function workSize(item: { size?: string }): WorkSize {
  return item.size === "s" || item.size === "m" ? "s" : "l";
}

/** The figure's `--size-w` value for a work. */
export function workSizeWidth(item: { size?: string }): string {
  return `${WORK_SIZE_PX[workSize(item)]}px`;
}
