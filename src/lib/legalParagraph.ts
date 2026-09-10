// The legal prose in src/i18n/legal.ts names the contact address inline, as
// plain text. LegalPage.astro renders each paragraph through this so the
// address comes out as a mailto link without the content having to carry
// markup.
export type ParagraphSegment = { kind: "text" | "email"; value: string };

export function splitOnEmail(text: string, email: string): ParagraphSegment[] {
  const out: ParagraphSegment[] = [];
  let rest = text;
  while (rest.length > 0) {
    const at = rest.indexOf(email);
    if (at === -1) {
      out.push({ kind: "text", value: rest });
      break;
    }
    if (at > 0) out.push({ kind: "text", value: rest.slice(0, at) });
    out.push({ kind: "email", value: email });
    rest = rest.slice(at + email.length);
  }
  return out;
}
