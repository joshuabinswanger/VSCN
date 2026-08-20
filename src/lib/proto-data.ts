// Mock data for the /proto/community visual prototype. No Firebase, no network.
// Deliberately deterministic so screenshots are comparable between runs.
import images from "./proto-images.json";

export interface ProtoImage {
  src: string;
  width: number;
  height: number;
}

export interface ProtoMember {
  id: string;
  name: string;
  /** Member-level caption line 1. Static — does not flip with the images. */
  role: string;
  /** Member-level caption line 2. Static — does not flip with the images. */
  description: string;
  tags: string[];
  images: ProtoImage[];
}

/** A member with one image does not flip at all. */
export const PROTO_MIN_IMAGES = 1;
/** ProtoMemberCard only has keyframes for 2 and 3 slots — do not exceed this. */
export const PROTO_MAX_IMAGES = 3;

/**
 * How many images each member has, cycled deterministically. Weighted toward
 * 3 but with real 1s and 2s in the mix, because a directory where every card
 * behaves identically would hide exactly the case most likely to look wrong.
 */
const IMAGE_COUNTS = [3, 2, 3, 1, 2, 3, 3, 2];

const NAMES = [
  "Anna Vogel", "Luca Bernasconi", "Mira Steinmann", "Jonas Fehr",
  "Sophie Rüegg", "Elias Brunner", "Nadia Kaufmann", "Timo Bachmann",
  "Lea Zimmermann", "Rafael Moser", "Ines Hofmann", "Samuel Grob",
  "Clara Wyss", "Nico Ammann", "Yara Frei", "Dominik Suter",
  "Elena Baumgartner", "Fabio Lüthi", "Hanna Widmer", "Ruben Achermann",
  "Marta Egli", "Silvan Hurni", "Nora Blattmann", "Aaron Studer",
];

const ROLES = [
  "Scientific illustrator", "Molecular animator", "Data designer",
  "Medical illustrator", "Research group", "Science journalist",
  "Infographic designer", "Museum exhibit designer",
];

const TAGS = [
  "molecular", "anatomy", "botany", "data viz", "editorial", "3D",
  "animation", "microscopy", "geology", "neuroscience", "print", "exhibition",
  "immunology", "climate", "cartography", "patient education",
];

/** Member-level caption line 2 — realistic length matters more than the words. */
const DESCRIPTIONS = [
  "Ink and digital colour for journals and museums",
  "Molecular and cellular processes, Blender and Cycles",
  "Figures and data graphics for peer-reviewed work",
  "Surgical and anatomical illustration, Zürich",
  "Cryo-EM structures redrawn for teaching",
  "Long-form science reporting and explainers",
  "Editorial infographics, print and screen",
  "Exhibition graphics and interpretive panels",
  "Botanical plates, watercolour and graphite",
  "Climate and Earth-system visualisation",
  "Patient-facing material in plain language",
  "Cartography for field research",
];

/** Deterministic index helper — no Math.random, so output is stable. */
const pick = <T>(arr: T[], n: number): T => arr[n % arr.length];

export const PROTO_MEMBERS: ProtoMember[] = NAMES.map((name, i) => ({
  id: `proto-${String(i).padStart(2, "0")}`,
  name,
  role: pick(ROLES, i * 3 + 1),
  description: pick(DESCRIPTIONS, i * 5 + 2),
  tags: [pick(TAGS, i * 5), pick(TAGS, i * 5 + 3), pick(TAGS, i * 5 + 7)],
  // Stride by a co-prime of the manifest length so members get varied motifs.
  images: Array.from({ length: pick(IMAGE_COUNTS, i) }, (_, s) => {
    const img = images[(i * 7 + s * 23) % images.length];
    return { src: img.src, width: img.width, height: img.height };
  }),
}));
