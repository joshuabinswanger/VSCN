// Fills the seeded galleries' two description fields, so the surfaces that show
// them can be judged with something in them.
//
// WHY THIS EXISTS. 2026-09-03 split an image's description in two — a LONG text
// for the member's own portfolio page and a SHORT one sentence for the lightbox
// band and everywhere else (see MAX_GALLERY_DESCRIPTION_SHORT in
// src/lib/gallery.ts). Both fields are empty across the whole of dev: the
// curated galleries were imported with no text at all, on purpose. So the one
// thing the change is about — a band with two different lengths of text in it,
// on a picture, at full screen — could not be looked at.
//
// THE TEXT IS PLACEHOLDER AND SAYS SO. seed-curated-galleries.mjs refuses to
// invent captions for other people's work, and it is right: the filenames are
// curation slugs, not the artists' titles, and writing a description for
// someone else's picture is putting words in their mouth. Nothing here claims
// anything about any image. Every line begins by naming itself as a stand-in
// and then runs on to a realistic LENGTH, which is the only property the layout
// actually needs — the point is to see a two-line summary in the lightbox band
// and a four-sentence paragraph under a portfolio image, not to read them.
//
// Four length bands are dealt round-robin by a hash of the imageId, so the
// deal is stable across runs and one member's gallery gets a spread of lengths
// rather than four copies of one.
//
//   --clear removes exactly what this wrote and nothing else: it only touches
//   items whose stored text is one of the strings below. Placeholder content
//   that cannot be taken out again is worse than none, and this is the half
//   that makes seeding it safe.
//
// DEV ONLY, and the refusal is not a formality: this text would be a lie on a
// member's public page under their name.
//
// It writes to the SAME THREE PLACES the gallery seeder does — the
// `images/{imageId}` record (the truth), and the gallery array on both
// `publicProfiles/{uid}` and `users/{uid}` (the projections). Seeding only the
// public copy would be wiped by the member's next save, which republishes from
// `users`.
//
// Members' own text is NEVER overwritten: an item that already has either field
// set to something that is not one of these placeholders is left alone.
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
 * The SHORT line — the lightbox band, the directory's other surfaces. Capped at
 * 240 characters (MAX_GALLERY_DESCRIPTION_SHORT); these run from about a third
 * of that to just under it, so the band is seen holding one line, two, and the
 * three that are its practical ceiling.
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

const KNOWN_SHORT = new Set(SHORT);
const KNOWN_LONG = new Set(LONG);

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

function textFor(imageId, index) {
  const h = hash(imageId || String(index));
  return {
    descriptionShort: SHORT[h % SHORT.length],
    description: LONG[(h >> 8) % LONG.length],
  };
}

/**
 * Whether this item is ours to write on: empty, or already holding a string
 * this script put there. Anything else is a member's own writing.
 */
function isOurs(item) {
  const short = (item.descriptionShort ?? "").trim();
  const long = (item.description ?? "").trim();
  return (!short || KNOWN_SHORT.has(short)) && (!long || KNOWN_LONG.has(long));
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
    const next = gallery.map((item, i) => {
      if (!isOurs(item)) {
        skippedImages++;
        return item;
      }
      const copy = { ...item };
      const wanted = doClear ? { descriptionShort: "", description: "" } : textFor(item.imageId, i);
      // A key set to "" must be REMOVED, not stored empty: both rulesets allow
      // the key to be absent and every consumer tests for presence, so an empty
      // string would be a third state nothing reads.
      const before = `${copy.descriptionShort ?? ""}|${copy.description ?? ""}`;
      if (wanted.descriptionShort) copy.descriptionShort = wanted.descriptionShort;
      else delete copy.descriptionShort;
      if (wanted.description) copy.description = wanted.description;
      else delete copy.description;
      if (`${copy.descriptionShort ?? ""}|${copy.description ?? ""}` !== before) touched++;
      return copy;
    });

    if (touched === 0) {
      console.log(`skip     ${name} — nothing to change`);
      continue;
    }

    if (doWrite) {
      // The RECORDS first — they are the truth, and the arrays are projections
      // of them. A run that died between the two would leave the records right
      // and the pages stale, which the next run repairs; the other order would
      // leave the pages saying something the records deny.
      for (const item of next) {
        if (!item.imageId) continue;
        await db.doc(`images/${item.imageId}`).set(
          {
            descriptionShort: item.descriptionShort ?? FieldValue.delete(),
            description: item.description ?? FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
      await doc.ref.update({ gallery: next, updatedAt: FieldValue.serverTimestamp() });
      const userRef = db.collection("users").doc(uid);
      if ((await userRef.get()).exists) {
        await userRef.update({ gallery: next, updatedAt: FieldValue.serverTimestamp() });
      } else {
        console.log(`  (no users/${uid} doc — publicProfiles only)`);
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
