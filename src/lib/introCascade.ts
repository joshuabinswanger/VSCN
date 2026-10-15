// THE INTRO IS THE HEADER'S OWN MECHANIC, PLAYED AS A SEQUENCE (2026-10-15,
// Josh: "Visual -> VScience -> VSCommunication -> VSCNetwork -> VSCN"). The
// header writes a word over the letters that follow its initial, one flap per
// glyph. The intro is a row of the same flap slots, and the chain below is a
// list of strings; between two of them, every slot whose glyph differs turns
// once, the flips sent across the line left to right. The choreography is
// planned here as data so it can be tested without a browser; PageLoader.astro
// only plays it.
export const INTRO_STATES = [
  "VSCN",
  "Visual",
  "VScience",
  "VSCommunication",
  "VSCNetwork",
  "VSCN",
] as const;

export type SlotChange = { index: number; char: string; delay: number };

export type CascadeTiming = {
  /** One beat is half a flip: the outgoing letter tips away on the first, the incoming drops in on the second. Seconds. */
  beat: number;
  /** Delay added per slot so a word flips across the line rather than all at once. Seconds. */
  stagger: number;
  /** Before the first state appears. Seconds. */
  lead: number;
  /** How long each state is held, once its last letter has landed, before the next begins. One per transition. Seconds. */
  holds: readonly number[];
  /** The folded VSCN's rest before it travels to the header. Seconds. */
  rest: number;
};

export type CascadeStep = { at: number; text: string; changes: SlotChange[] };

export type CascadePlan = {
  slots: number;
  steps: CascadeStep[];
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

export function planCascade(states: readonly string[], timing: CascadeTiming): CascadePlan {
  const slots = Math.max(...states.map((s) => s.length));
  const flip = 2 * timing.beat;
  const steps: CascadeStep[] = [];
  let at = timing.lead;
  let previous = "";
  states.forEach((text, i) => {
    const changes = diffLine(previous, text, slots, timing.stagger);
    steps.push({ at: round(at), text, changes });
    const landed = at + flip + (changes.at(-1)?.delay ?? 0);
    at = landed + (timing.holds[i] ?? timing.rest);
    previous = text;
  });
  // The last hold index is one past the holds list, so `at` already carries the rest.
  return { slots, steps, travelAt: round(at) };
}

function round(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}
