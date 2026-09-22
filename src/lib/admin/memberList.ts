/**
 * The roster table: sortable columns, a persisted column picker, and the row
 * flags. The console decides WHICH rows are shown (filter + scope); this
 * module decides their order and shape.
 */
import type { MemberRow } from "../adminApi.ts";
import { type Child, copyButton, el, fmt, fmtDate } from "./dom.ts";

export interface ListDeps {
  go(hash: string): void;
  /** The "look this up as an id" fallback, offered when the filter matches no row. */
  lookupOffer(query: string): Node;
}

interface Column {
  id: string;
  label: string;
  /** The value the column sorts by; null sorts last in either direction. */
  sortKey(m: MemberRow): string | number | null;
  cell(m: MemberRow, deps: ListDeps): Child | Child[];
  numeric?: boolean;
  /** Cannot be hidden — the row would have no way into the member without it. */
  locked?: boolean;
}

const lower = (s: string) => s.toLowerCase();
const time = (iso: string | null) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

const COLUMNS: Column[] = [
  {
    id: "displayName", label: "Name", locked: true,
    sortKey: (m) => lower(m.displayName || m.uid),
    // The name is ONLY the name. Its flags used to trail it as chips, which
    // made the one column every eye starts in ragged — see the Status column.
    cell(m, deps) {
      const name = el("button", { type: "button", class: "namebtn" }, m.displayName || "(no name)");
      name.addEventListener("click", () => deps.go(`#uid/${encodeURIComponent(m.uid)}`));
      return name;
    },
  },
  {
    id: "slug", label: "Slug",
    sortKey: (m) => (m.slug ? lower(m.slug) : null),
    // The slug is the one field that points OUT of the console: it is the
    // member's real public page, which is usually what an admin wants to
    // check next. Absent (or hidden) members get plain text — a link to a
    // 404 is worse than none.
    cell: (m) => m.slug && m.active
      ? el("a", { href: `/members/${m.slug}`, target: "_blank", rel: "noreferrer" }, m.slug)
      : el("span", { class: "muted" }, m.slug || "—"),
  },
  {
    id: "email", label: "Email",
    sortKey: (m) => (m.email ? lower(m.email) : null),
    cell: (m) => el("span", { class: "muted" }, m.email ?? "—"),
  },
  {
    id: "memberType", label: "Type",
    sortKey: (m) => (m.memberType ? lower(m.memberType) : null),
    cell: (m) => el("span", { class: "muted" }, m.memberType || "—"),
  },
  {
    id: "role", label: "Role",
    sortKey: (m) => (m.role ? lower(m.role) : null),
    // Cut at 24ch by the stylesheet; the whole role is in the title, and the
    // column can be dragged wider.
    cell: (m) => el("span", { class: "muted", title: m.role }, m.role || "—"),
  },
  {
    id: "status", label: "Status",
    sortKey: (m) => lower(m.status),
    cell: statusCell,
  },
  {
    id: "galleryCount", label: "Gallery", numeric: true,
    sortKey: (m) => m.galleryCount,
    cell: (m) => String(m.galleryCount),
  },
  {
    id: "imageRecords", label: "Records", numeric: true,
    sortKey: (m) => m.imageRecords,
    cell: (m) => String(m.imageRecords),
  },
  {
    id: "createdAt", label: "Created",
    sortKey: (m) => time(m.createdAt),
    // The DAY only: a roster is scanned down a column, and the time of day an
    // account was made has never decided anything here. The full timestamp is
    // in the title, and the member's own record carries it in full.
    cell: (m) => el("span", { class: "muted nowrap", title: m.createdAt ? fmt(m.createdAt) : "" },
      m.createdAt ? fmtDate(m.createdAt) : "—"),
  },
  {
    id: "uid", label: "uid",
    sortKey: (m) => m.uid,
    cell: (m) => el("span", { class: "copyable" }, el("code", { class: "muted" }, m.uid), copyButton(m.uid)),
  },
];

/**
 * EVERYTHING ABOUT A MEMBER'S STANDING IS IN ONE CELL (2026-09-22, Josh:
 * "fold the no auth and hidden into the status instead of behind the user
 * name"). The lifecycle word the server sends leads, coloured by what it
 * means; the conditions that are not a lifecycle — no Auth user, an
 * unverified address — follow it as quiet pills. `hidden` and `deleting` are
 * added only when the word itself does not already say so, so a row never
 * reads "deleting · deleting".
 */
function statusCell(m: MemberRow): Child {
  const word = m.status || (m.active ? "active" : "hidden");
  const said = lower(word);
  const tone = m.pendingDeletion ? "danger" : !m.active ? "warn" : "ok";
  const flags: Child[] = [
    el("span", { class: `status status--${tone}` }, el("i", { class: "status__dot", "aria-hidden": "true" }), word),
  ];
  if (!m.active && !said.startsWith("hidden") && !m.pendingDeletion) flags.push(el("span", { class: "tag" }, "hidden"));
  if (m.pendingDeletion && !said.startsWith("delet")) flags.push(el("span", { class: "tag tag--warn" }, "deleting"));
  if (!m.hasAuth) flags.push(el("span", { class: "tag" }, "no auth"));
  if (m.hasAuth && m.emailVerified === false) flags.push(el("span", { class: "tag" }, "unverified"));
  return el("span", { class: "chips" }, ...flags);
}

const STORAGE_KEY = "vscn-admin-hidden-columns";
const WIDTH_KEY = "vscn-admin-column-widths";

/**
 * COLUMNS CAN BE DRAGGED (2026-09-22, Josh: "make columns expandable").
 * Every column packs to its content and long values are cut with an
 * ellipsis; the edge of a header is a grip that sets that column's width,
 * kept in localStorage like the hidden set. Double-click a grip to let the
 * column pack again.
 */
function loadWidths(): Map<string, number> {
  try {
    const raw = localStorage.getItem(WIDTH_KEY);
    const obj = raw ? (JSON.parse(raw) as unknown) : {};
    const out = new Map<string, number>();
    if (obj && typeof obj === "object") {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) if (typeof v === "number" && v > 0) out.set(k, v);
    }
    return out;
  } catch {
    return new Map();
  }
}
function saveWidths(widths: Map<string, number>): void {
  try {
    localStorage.setItem(WIDTH_KEY, JSON.stringify(Object.fromEntries(widths)));
  } catch {
    /* not persisted this time; the in-memory map still applies */
  }
}
const MIN_COL = 56;

/** localStorage can throw (private mode, blocked storage) — every touch is guarded. */
function loadHidden(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}
function saveHidden(hidden: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden]));
  } catch {
    /* not persisted this time; the in-memory set still applies */
  }
}

export interface MemberList {
  /**
   * @param all   every loaded member (for the "n of m" count)
   * @param shown the rows that pass the filter and scope, in any order
   * @param query the filter text, used only for the lookup fallback
   */
  render(all: MemberRow[], shown: MemberRow[], query: string): void;
}

export function createMemberList(host: HTMLElement, deps: ListDeps): MemberList {
  let sortBy = "displayName";
  let dir: 1 | -1 = 1;
  const hidden = loadHidden();
  for (const c of COLUMNS) if (c.locked) hidden.delete(c.id);
  const widths = loadWidths();
  /** A dragged width is an inline size on every cell of the column, header included. */
  const sized = <T extends HTMLElement>(cell: T, id: string): T => {
    const w = widths.get(id);
    const px = w ? `${w}px` : "";
    cell.style.width = px;
    cell.style.minWidth = px;
    cell.style.maxWidth = px;
    return cell;
  };
  const applyWidth = (id: string) => {
    for (const cell of host.querySelectorAll<HTMLElement>(`.col-${id}`)) sized(cell, id);
  };
  function grip(c: Column): HTMLElement {
    const g = el("span", { class: "th-grip", title: "Drag to resize · double-click to reset" });
    g.addEventListener("pointerdown", (e) => {
      const th = g.parentElement;
      if (!th) return;
      e.preventDefault();
      const x0 = e.clientX;
      const w0 = th.getBoundingClientRect().width;
      g.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        widths.set(c.id, Math.max(MIN_COL, Math.round(w0 + ev.clientX - x0)));
        applyWidth(c.id);
      };
      const up = () => {
        g.removeEventListener("pointermove", move);
        g.removeEventListener("pointerup", up);
        g.removeEventListener("pointercancel", up);
        saveWidths(widths);
      };
      g.addEventListener("pointermove", move);
      g.addEventListener("pointerup", up);
      g.addEventListener("pointercancel", up);
    });
    g.addEventListener("dblclick", () => {
      widths.delete(c.id);
      saveWidths(widths);
      rerender();
    });
    return g;
  }

  let last: { all: MemberRow[]; shown: MemberRow[]; query: string } | null = null;
  const rerender = () => last && render(last.all, last.shown, last.query);

  // Built ONCE and re-attached on every render, so it stays open while the
  // admin ticks boxes — the list re-renders on every keystroke and a fresh
  // <details> would snap shut each time.
  const picker = el("details", { class: "colpick" }, el("summary", { class: "btn-link" }, "Columns"));
  const pickerBody = el("div", { class: "colpick__body" });
  picker.append(pickerBody);
  for (const c of COLUMNS) {
    const box = el("input", { type: "checkbox" }) as HTMLInputElement;
    box.checked = !hidden.has(c.id);
    if (c.locked) box.disabled = true;
    box.addEventListener("change", () => {
      if (box.checked) hidden.delete(c.id);
      else hidden.add(c.id);
      saveHidden(hidden);
      rerender();
    });
    pickerBody.append(el("label", { class: "colpick__opt" }, box, " ", c.label));
  }

  function compare(a: MemberRow, b: MemberRow, col: Column): number {
    const x = col.sortKey(a);
    const y = col.sortKey(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1; // absent values sink to the bottom regardless of direction
    if (y === null) return -1;
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return c * dir;
  }

  function render(all: MemberRow[], shown: MemberRow[], query: string): void {
    last = { all, shown, query };
    const cols = COLUMNS.filter((c) => !hidden.has(c.id));
    const col = COLUMNS.find((c) => c.id === sortBy) ?? COLUMNS[0];
    const rows = [...shown].sort((a, b) => compare(a, b, col) || a.uid.localeCompare(b.uid));

    const head = el("tr", {}, ...cols.map((c) => {
      const active = c.id === sortBy;
      const btn = el("button", { type: "button", class: `sortbtn${active ? " sortbtn--on" : ""}` },
        c.label,
        el("span", { class: "sortbtn__dir", "aria-hidden": "true" }, active ? (dir === 1 ? "▲" : "▼") : "↕"));
      btn.addEventListener("click", () => {
        if (sortBy === c.id) dir = dir === 1 ? -1 : 1;
        else { sortBy = c.id; dir = 1; }
        rerender();
      });
      return sized(el("th", {
        scope: "col",
        "aria-sort": active ? (dir === 1 ? "ascending" : "descending") : "none",
        class: `col-${c.id}${c.numeric ? " num" : ""}`,
      }, btn, grip(c)), c.id);
    }));

    const body = rows.map((m) => el("tr", {}, ...cols.map((c) => {
      const content = c.cell(m, deps);
      return sized(el("td", { class: `col-${c.id}${c.numeric ? " num" : ""}` }, ...(Array.isArray(content) ? content : [content])), c.id);
    })));

    const card = el("div", { class: "card" },
      el("div", { class: "card__head" },
        // "8 of 8 member(s)" made the reader do arithmetic to learn that
        // nothing was filtered out. Say the filtered count only when it is
        // actually a subset.
        el("h2", {}, shown.length === all.length
          ? `${all.length} member${all.length === 1 ? "" : "s"}`
          : `${shown.length} of ${all.length} members`),
        picker,
      ),
      shown.length
        ? el("div", { class: "tablewrap" }, el("table", {}, el("thead", {}, head), el("tbody", {}, ...body)))
        : el("p", { class: "muted" }, "No member matches."),
      // THE OLD SEARCH BOX'S ONE IRREPLACEABLE TRICK: resolving an id that is
      // not a member — an imageId, a retired slug, an Auth uid with no
      // profile. Offered only when the list has nothing, so it never competes
      // with the filter in the common case.
      !shown.length && query ? deps.lookupOffer(query) : null,
    );
    host.replaceChildren(card);
    host.hidden = false;
  }

  return { render };
}
