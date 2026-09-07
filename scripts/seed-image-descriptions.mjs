// Fills the seeded galleries' CAPTION and DESCRIPTION, so the surfaces that
// show them can be judged with something in them.
//
// WHY THIS EXISTS. 2026-09-03 split an image's description in two — a LONG text
// for the member's own portfolio page and a SHORT one sentence for the lightbox
// band. Both fields were empty across the whole of dev: the curated galleries
// were imported with no text at all, on purpose. So the one thing the change
// was about — a band with text in it, on a picture, at full screen — could not
// be looked at.
//
// 2026-09-06 EXTENDED THIS TO THE CAPTION, and retired the short field.
//
//   THE CAPTION, because it was the remaining hole. All 47 seeded images on dev
//   carried an EMPTY caption, so `data-pswp-caption` appeared exactly zero
//   times across every member page: the description half of "we only need
//   captions and a description" could be judged on dev and the caption half
//   could not be seen at all.
//
//   `descriptionShort` IS RETIRED — one description per image now (see
//   GalleryItem in src/lib/gallery.ts; MAX_GALLERY_DESCRIPTION_SHORT is gone).
//   This script no longer WRITES it, but still RECOGNISES and REMOVES it, in
//   both modes. That asymmetry is the point: 44 images on dev are still holding
//   a short placeholder this script put there, and a build that stopped
//   recognising the string would have stranded it in the database for good.
//   FILL now clears it as it goes, so there is no separate cleanup run.
//
// THE TEXT IS PLACEHOLDER AND SAYS SO. seed-curated-galleries.mjs refuses to
// invent captions for other people's work, and it is right: the filenames are
// curation slugs, not the artists' titles, and writing a caption for someone
// else's picture is putting words in their mouth. Nothing here claims anything
// about any image. Every line begins by naming itself as a stand-in and then
// runs on to a realistic LENGTH, which is the only property the layout actually
// needs — the point is to see a title-length line on a card and a paragraph
// under a portfolio image, not to read them.
//
// A CONSEQUENCE WORTH KNOWING: the caption doubles as the image's ALT TEXT and
// the directory card's accessible name. While this text is seeded, dev's alt
// text is placeholder too — dev is not the place to judge screen-reader output.
//
// CAPTIONS COME IN TWO LANGUAGES, picked per work rather than per member. A
// caption is ONE non-localised string shown in both locales, so a German title
// appears on the English pages and the other way round — the real limitation of
// the field, and invisible if every placeholder is in one language. The
// language follows the work's own title (ENGLISH_TITLED below), traced through
// the `images/{imageId}` record's `provenance.source`, because the gallery
// array itself carries nothing but a random uuid and no filename at all.
//
// Length bands are dealt round-robin by a hash of the imageId, so the deal is
// stable across runs and one member's gallery gets a spread of lengths rather
// than three copies of one.
//
//   --clear removes exactly what this wrote and nothing else: it only touches
//   records whose stored text is one of the strings below. Placeholder content
//   that cannot be taken out again is worse than none, and this is the half
//   that makes seeding it safe.
//
// DEV ONLY, and the refusal is not a formality: this text would be a lie on a
// member's public page under their name.
//
// It writes THE RECORD AND NOTHING ELSE. Since 2026-09-07 the `gallery` array
// on both profile docs is a list of image ids carrying no text at all
// (documentation/20260907-works-on-the-record-design.md), so `images/{imageId}`
// is the only place this text can live. The old hazard this paragraph used to
// warn about — seeding the public copy alone, which the member's next save
// would republish away from `users` — went away with the projection itself.
//
// Members' own text is NEVER overwritten: a RECORD that already has any of the
// three fields set to something that is not one of these placeholders is left
// alone. It judges only the three fields it writes, so a member's `captionDe`,
// `descriptionDe` or `link` is neither read nor touched here.
//
// Usage (there is no default project — -P is mandatory):
//   node scripts/seed-image-descriptions.mjs -P dev            # dry run
//   node scripts/seed-image-descriptions.mjs -P dev --write    # fill them in
//   node scripts/seed-image-descriptions.mjs -P dev --write --clear   # take them out

import { FieldValue } from "firebase-admin/firestore";
import { initAdminApp, parseArgs } from "./lib/admin-app.mjs";

// --- CLI -----------------------------------------------------------------

const args = process.argv.slice(2);
const { project, flags } = parseArgs(args);
const doWrite = flags.has("--write");
const doClear = flags.has("--clear");

if (project === "prod") {
  console.error(
    "Refusing to run on prod. This writes PLACEHOLDER text onto members' images, under their names, on their public pages.",
  );
  process.exit(1);
}

const { db, projectId, close } = initAdminApp(project);

console.log(`Project: ${projectId}`);
console.log(doClear ? "CLEAR mode" : "FILL mode");
console.log(doWrite ? "WRITE mode" : "Dry run (pass --write to apply)");

// --- The placeholder text --------------------------------------------------
//
// Every string is listed here so --clear can recognise its own work. Never edit
// one in place: a changed string is one this script can no longer take out of
// the database. Add a new band instead, and clear with the old build first.

/**
 * The CAPTION — one line, on the directory card, the lightbox and the member's
 * page. Capped at 140 (MAX_GALLERY_CAPTION, enforced by `validImage` on the
 * record and by the client). A real caption is often just a title, so the
 * shortest band is title-length and the longest sits near the ceiling: the
 * range the layout has to survive is a two-word title next to a line that
 * wraps.
 *
 * Deliberately says nothing about any picture — see the header. The wording
 * differs between the two languages rather than being a translation of one
 * string, because two members writing their own titles would not match either.
 */
const CAPTIONS_EN = [
  "Placeholder caption, not a title.",
  "Placeholder caption, standing in for the artist's own title.",
  "Placeholder caption, standing in for the title the artist would give this image and the subject it names.",
  "Placeholder caption standing in for the artist's own title, run out to about the length a card and a lightbox can hold.",
];

const CAPTIONS_DE = [
  "Platzhalter, kein echter Bildtitel.",
  "Platzhalter-Bildtitel, anstelle des echten Titels dieses Bildes.",
  "Platzhalter-Bildtitel: er steht anstelle des Titels, der zu diesem Bild gehört, und nennt nichts über den Inhalt.",
  "Platzhalter-Bildtitel, anstelle des echten Titels, ausgeschrieben auf etwa die Länge, die Karte und Lightbox tragen.",
];

/**
 * The works whose own title is in ENGLISH; everything else gets German.
 *
 * EXPLICIT RATHER THAN DERIVED, exactly as the `SLUGS` map in
 * seed-curated-galleries.mjs is explicit — "which language is this title in" is
 * a judgement per file, not something a rule reads off a slug. A Latin binomial
 * (`03-rhinanthus`, `01-catocala-fulminea`) is neither, and falls to German on
 * purpose: a real caption around a Latin name would be in the member's own
 * language.
 *
 * Keys are the path under `curated-galleries/img/`, which is what
 * `provenance.source` stores. German is the default, so a newly curated image
 * lands German without being listed — flip one entry to move one work.
 */
const ENGLISH_TITLED = new Set([
  "gregor-forster/01-abc-under-the-sea.webp",
  "janina-hess/02-srf-we-myself-why.webp",
  "janina-hess/03-nikin-together-for-nature.webp",
  "joshua-binswanger/01-xylopedia-ct-oak.webp",
  "joshua-binswanger/03-phenological-shift.webp",
  "quaint/01-metatarsophalangeal-joint.webp",
  "quaint/02-bio-oss-collagen.webp",
  "quaint/03-geo-engineering.webp",
  "selina-bachmann/01-snowdrop-galanthus.webp",
  "wong-chi-lui/02-botanicals.webp",
]);

/**
 * RETIRED, AND KEPT ANYWAY. Nothing writes these any more (see the header), but
 * 44 images on dev are still holding one, and `--clear` can only remove a
 * string it can still recognise. Deleting this array would strand them.
 *
 * Was: the short line for the lightbox band, capped at 240.
 */
const SHORT = [
  "Placeholder summary standing in for the artist's own sentence about this image.",
  "Placeholder summary, standing in for the one line the artist would write here about what the picture shows and who it was made for.",
  "Placeholder summary. It stands in for the artist's own sentence, and it is written out to roughly the length a real one runs to once it has named the subject, the medium and the commission behind it.",
  "Placeholder summary in the artist's place: what the image is, in one sentence, at about the length the lightbox band can hold before it has to start scrolling — which is what this line is here to show.",
];

/**
 * The LONG text — the member's portfolio page and nowhere else. Capped at 600
 * (MAX_GALLERY_DESCRIPTION); a real one is a paragraph, so these are too.
 */
const LONG = [
  "Placeholder description, standing in for the artist's own account of this image. A real one would say what is shown, how it was made, and what it was made for.",
  "Placeholder description, standing in for the artist's own account of this image. A real one would say what is shown and how it was made — the technique, the reference material, the constraints the brief set — and then what it was for: the publication, the exhibition or the researcher it was drawn for, and what that reader needed to be able to see.",
  "Placeholder description, standing in for the artist's own account of this image.\n\nA real one would open with the subject and the commission. It would go on to the making: the reference material, the technique, the decisions that the constraints forced. It would end with the reader — who this was drawn for, and what they needed to be able to see in it that a photograph could not have shown them.",
  "Placeholder description, standing in for the artist's own account of this image.\n\nA real one would open with the subject and the commission, and say plainly what is in the picture. It would go on to the making: reference material, technique, the decisions the brief's constraints forced and the ones that were free. It would say where the image ran, and at what size, because that changes what can be in it.\n\nAnd it would end with the reader — who this was drawn for, and what they needed to see in it.",
];

const KNOWN_CAPTIONS = new Set([...CAPTIONS_EN, ...CAPTIONS_DE]);
const KNOWN_SHORT = new Set(SHORT);
const KNOWN_LONG = new Set(LONG);

/**
 * Which language this work's own title is in.
 *
 * Costs one read per image (47 on dev), in dry runs too, because the gallery
 * array is no help: `seed-curated-galleries.mjs` gives every item a
 * `randomUUID()` and a storage url, and keeps the curation filename only on the
 * record, under `provenance.source`. No provenance — a member's own later
 * upload, three of them on dev — falls to German with everything else.
 */
async function langFor(imageId) {
  if (!imageId) return "de";
  const snap = await db.doc(`images/${imageId}`).get();
  const source = snap.exists ? snap.data()?.provenance?.source : undefined;
  if (!source) return "de";
  return ENGLISH_TITLED.has(source.replace(/^curated-galleries\/img\//, "")) ? "en" : "de";
}

// Cheap, stable, and good enough to spread 48 ids over 4 buckets. Two
// independent offsets so an image does not always get the matching pair — a
// long paragraph under a one-line summary is a combination the pages have to
// survive, and the likeliest one in real data.
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function textFor(imageId, index, lang) {
  const h = hash(imageId || String(index));
  const captions = lang === "en" ? CAPTIONS_EN : CAPTIONS_DE;
  return {
    // Indexes with `h` itself, which is unsigned — see the note below for why
    // that matters, and never change this to a signed shift.
    caption: captions[h % captions.length],
    // >>> AND NOT >>. `hash` returns an unsigned 32-bit value, so any hash with
    // the high bit set is a NEGATIVE int32 under the signed shift — and a
    // negative modulo stays negative in JS, so `LONG[-3]` was `undefined`.
    // Every such image silently got NO long text: the caller reads the falsy
    // value as "delete this key", the item then matches what is already stored,
    // and the run reports nothing to change. That was 21 of 50 images on dev,
    // and it looked like the tool had converged. The field that used to sit
    // above this one was never affected, because it indexed with `h` itself —
    // which is why `caption` does the same.
    description: LONG[(h >>> 8) % LONG.length],
  };
}

/**
 * Whether this RECORD is ours to write on: empty, or already holding a string
 * this script put there. Anything else is a member's own writing.
 *
 * ALL THREE fields have to pass, including the retired one. A member who typed
 * their own caption and left the description empty still owns the work, and a
 * member's title is the last thing that should be overwritten by a stand-in
 * for it.
 */
function isOurs(item) {
  const caption = (item.caption ?? "").trim();
  const short = (item.descriptionShort ?? "").trim();
  const long = (item.description ?? "").trim();
  return (
    (!caption || KNOWN_CAPTIONS.has(caption)) &&
    (!short || KNOWN_SHORT.has(short)) &&
    (!long || KNOWN_LONG.has(long))
  );
}

// --- Seed ------------------------------------------------------------------

try {
  const profiles = await db.collection("publicProfiles").get();

  let members = 0;
  let images = 0;
  let skippedImages = 0;

  for (const doc of profiles.docs) {
    const uid = doc.id;
    const name = (doc.data().displayName || uid).trim();
    const gallery = doc.data().gallery;
    if (!Array.isArray(gallery) || gallery.length === 0) continue;

    let touched = 0;
    const patches = []; // [imageId, fields]
    // A for loop, not `.map()`: the body awaits twice — the record read and
    // `langFor` — and an async callback in `.map()` would collect promises
    // instead of doing the work.
    for (let i = 0; i < gallery.length; i++) {
      const imageId = typeof gallery[i] === "string" ? gallery[i] : gallery[i]?.imageId;
      if (!imageId) continue;
      // The RECORD is the only copy since 2026-09-07 (the array is ids) — so
      // the seed reads it, judges ownership of the text on it, and writes it.
      const snap = await db.doc(`images/${imageId}`).get();
      const rec = snap.exists ? snap.data() : null;
      if (!rec || !isOurs(rec)) {
        skippedImages++;
        continue;
      }
      const wanted = doClear ? { caption: "", description: "" } : textFor(imageId, i, await langFor(imageId));
      const key = (o) => `${o.caption ?? ""}|${o.description ?? ""}|${o.descriptionShort ?? ""}`;
      const next = { caption: wanted.caption || undefined, description: wanted.description || undefined };
      if (key(next) !== key(rec)) {
        touched++;
        patches.push([imageId, {
          // DELETED when empty: absent is what a seeded record looks like.
          caption: next.caption ?? FieldValue.delete(),
          description: next.description ?? FieldValue.delete(),
          descriptionShort: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        }]);
      }
    }

    if (touched === 0) {
      console.log(`skip     ${name} — nothing to change`);
      continue;
    }

    if (doWrite) {
      for (const [imageId, fields] of patches) {
        await db.doc(`images/${imageId}`).set(fields, { merge: true });
      }
    }

    console.log(
      `${doWrite ? (doClear ? "CLEARED" : "FILLED ") : "would   "}  ${name}  (${touched}/${gallery.length} images)`,
    );
    members++;
    images += touched;
  }

  console.log(
    `\n${images} image(s) on ${members} member(s) ${doWrite ? "changed" : "to change"}` +
      (skippedImages ? `, ${skippedImages} left alone (member's own text)` : "") +
      ".",
  );
  if (!doWrite) console.log("Nothing written.");
  if (doWrite && !doClear) {
    console.log("Re-run with --clear --write to take the placeholder text out again.");
  }
} finally {
  await close();
}
