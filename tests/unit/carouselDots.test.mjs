import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "../helpers/load-ts.mjs";

// Instagram's sliding window of dots (src/lib/carouselDots.ts): at most five
// show, an edge dot with more beyond it shrinks, the current one never does.
// Each dot reads as one letter: O current, o full, m mid, s small, - out.
function dot() {
  const classes = new Set();
  return {
    classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) },
    read() {
      if (classes.has("cdot--out")) return "-";
      if (classes.has("cdot--sm")) return "s";
      if (classes.has("cdot--md")) return "m";
      return classes.has("cdot--on") ? "O" : "o";
    },
  };
}
const el = () => ({
  style: { setProperty() {} },
  append() {},
  replaceChildren() {},
  setAttribute() {},
  className: "",
});

function harness(n) {
  const { mountDots } = loadTs("src/lib/carouselDots.ts", {}, { document: { createElement: el } });
  const dots = Array.from({ length: n }, dot);
  const show = mountDots({ querySelector: () => null, append() {} }, dots);
  return (i) => {
    show(i);
    return dots.map((d) => d.read()).join("");
  };
}

test("carouselDots: a dot shrinks three and four away from the current one", () => {
  const at = harness(3);
  assert.equal(at(0), "Ooo");
  assert.equal(at(2), "ooO");
  const five = harness(5);
  assert.equal(five(0), "Oooms", "Instagram's first slide: the 4th and 5th are smaller");
  assert.equal(five(2), "ooOoo");
  assert.equal(five(4), "smooO");
});

test("carouselDots: more than five slide a window with shrinking edges", () => {
  const at = harness(8);
  assert.equal(at(0), "Oooms---");
  assert.equal(at(3), "mooOs---");
  assert.equal(at(4), "-smoOs--", "the window slides once the current dot nears its edge");
  assert.equal(at(7), "---smooO", "at the true end the current dot may reach the edge");
  assert.equal(at(4), "---sOoom", "going back, the window holds until it must move");
  assert.equal(at(3), "--sOoms-");
});
