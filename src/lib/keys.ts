/**
 * Is a modifier held? Arrow, Home and End handlers on tabs and carousels
 * return early when one is (2026-09-29): Alt+Left is the browser's Back,
 * Ctrl/Cmd+Home and End jump to the ends of the page, and Shift+arrow extends
 * a selection. PhotoSwipe's own key handler steps aside the same way.
 */
export function hasKeyModifier(event: {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): boolean {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}
