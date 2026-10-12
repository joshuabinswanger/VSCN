// A member's prose split into its paragraphs (2026-10-12, Josh: "more vertical
// padding for paragraphs in profile view"). The text is stored as one string
// with blank lines between paragraphs, and was printed as one `pre-line` block,
// so a paragraph break was one empty line high and nothing could space it.
// Now each paragraph is its own block (.mprof__para in profile.css), still
// `pre-line` inside so a single line break stays a line break. Text only —
// nothing is ever interpreted as markup, on the page or in the preview.

/** The paragraphs of `text`: split on blank lines, trimmed, empties dropped. */
export function splitParagraphs(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** The preview's twin of the page's markup: one span per paragraph. */
export function fillParagraphs(el: HTMLElement, text: string | null | undefined): void {
  el.replaceChildren(
    ...splitParagraphs(text).map((p) => {
      const span = document.createElement("span");
      span.className = "mprof__para";
      span.textContent = p;
      return span;
    })
  );
}
