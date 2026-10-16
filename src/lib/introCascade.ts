// THE INTRO IS THE HEADER'S OWN MECHANIC, STACKED (2026-10-15). The header
// writes a word over the letters that follow its initial, one flap per glyph.
// The intro is four rows of the same flap slots, initials aligned in a column:
// the initials arrive top to bottom, each row writes its word, the whole name
// holds, and then each row sets off for the header as a whole word, its tail
// folding away in flight, so it lands as its initial on its own slot of the
// header's VSCN ("it should transition from full words directly into the top
// VSCN"). (Josh, same day: first "Visual -> VScience
// -> VSCommunication -> VSCNetwork -> VSCN" on one line, then "i like the
// vertical alignment ... make the animation vertical again but then smoothly
// transition into the bar on the top left".) The choreography is planned here
// as data so it can be tested without a browser; PageLoader.astro only plays it.
export const INTRO_WORDS = ["Visual", "Science", "Communication", "Network"] as const;

export type SlotChange = { index: number; char: string; delay: number };

export type StackTiming = {
  /** One beat is half a flip: the outgoing letter tips away on the first, the incoming drops in on the second. Seconds. */
  beat: number;
  /** Delay added per slot so a word flips across its row rather than all at once. Seconds. */
  stagger: number;
  /** Before the first initial appears. Seconds. */
  lead: number;
  /** Between one initial's arrival and the next, top to bottom. Seconds. */
  arriveStagger: number;
  /** After the last initial has landed, before the first word writes. Seconds. */
  hold: number;
  /** Between one row starting to write and the next. Seconds. */
  rowOffset: number;
  /** How long the whole name stays readable before the words fold. Seconds. */
  holdName: number;
  /** Between one row starting to fold and the next, top to bottom. Seconds. */
  foldStagger: number;
  /** After the first row starts to fold, when the rows set off for the header. The fold finishes in flight. Seconds. */
  travelLag: number;
};

export type StackEvent = {
  at: number;
  row: number;
  phase: "arrive" | "write" | "fold";
  changes: SlotChange[];
};

export type StackPlan = {
  rows: number;
  slotsPerRow: number;
  events: StackEvent[];
  travelAt: number;
};

/** The slots whose glyph differs between two states, each delayed by its distance from the first change. A slot past the new state's end clears to "". */
export function diffLine(from: string, to: string, slots: number, stagger: number): SlotChange[] {
  const changes: SlotChange[] = [];
  let first = -1;
  for (let index = 0; index < slots; index += 1) {
    const before = from[index] ?? "";
    const after = to[index] ?? "";
    if (before === after) continue;
    if (first === -1) first = index;
    changes.push({ index, char: after, delay: round((index - first) * stagger) });
  }
  return changes;
}

export function planStack(words: readonly string[], timing: StackTiming): StackPlan {
  const slotsPerRow = Math.max(...words.map((w) => w.length));
  const flip = 2 * timing.beat;
  const landed = (event: StackEvent) =>
    event.at + flip + Math.max(0, ...event.changes.map((change) => change.delay));
  const events: StackEvent[] = [];

  const arrivals = words.map((word, row): StackEvent => ({
    at: round(timing.lead + row * timing.arriveStagger),
    row,
    phase: "arrive",
    changes: diffLine("", word[0], slotsPerRow, timing.stagger),
  }));
  events.push(...arrivals);

  const writeAt = Math.max(...arrivals.map(landed)) + timing.hold;
  const writes = words.map((word, row): StackEvent => ({
    at: round(writeAt + row * timing.rowOffset),
    row,
    phase: "write",
    changes: diffLine(word[0], word, slotsPerRow, timing.stagger),
  }));
  events.push(...writes);

  const foldAt = Math.max(...writes.map(landed)) + timing.holdName;
  const folds = words.map((word, row): StackEvent => ({
    at: round(foldAt + row * timing.foldStagger),
    row,
    phase: "fold",
    changes: retract(diffLine(word, word[0], slotsPerRow, timing.stagger)),
  }));
  events.push(...folds);

  return {
    rows: words.length,
    slotsPerRow,
    events,
    travelAt: round(folds[0].at + timing.travelLag),
  };
}

/** The same changes, staggered from the LAST slot back towards the first (2026-10-15, Josh: "on mobile ... the letters overlap"). A fold that started next to the initial closed those cells first and pulled the rest of the word left over letters still tipping away; retracting from the end, a closing cell only ever has empty space to its right. */
function retract(changes: SlotChange[]): SlotChange[] {
  const last = changes.at(-1)?.delay ?? 0;
  return changes.map((change) => ({ ...change, delay: round(last - change.delay) }));
}

function round(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}
