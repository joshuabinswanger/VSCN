"""Builds vscn.ase (Affinity/Adobe swatch file) and spec-board.svg from the
site's tokens. Run: python make-kit.py  (from design-kit/)."""
import struct

COLORS = [
    ("Ink / color-dark", "#000000"),
    ("Paper / color-bg", "#fcfbfa"),
    ("Border / color-border", "#e0e0e0"),
    ("Muted / color-muted", "#686868"),
    ("Placeholder / color-text-placeholder", "#707070"),
    ("Error / color-error", "#b83232"),
    ("Success / color-success", "#217a47"),
]

def ase(path):
    def block_name(s):
        b = s.encode("utf-16-be") + b"\x00\x00"
        return struct.pack(">H", len(b) // 2) + b
    chunks = []
    # group start
    name = block_name("VSCN")
    chunks.append(struct.pack(">HI", 0xC001, len(name)) + name)
    for label, hexv in COLORS:
        r, g, b = (int(hexv[i:i+2], 16) / 255 for i in (1, 3, 5))
        n = block_name(label)
        body = n + b"RGB " + struct.pack(">fff", r, g, b) + struct.pack(">H", 0)
        chunks.append(struct.pack(">HI", 0x0001, len(body)) + body)
    chunks.append(struct.pack(">HI", 0xC002, 0))
    data = b"ASEF" + struct.pack(">HHI", 1, 0, len(chunks)) + b"".join(chunks)
    open(path, "wb").write(data)

VOICES = [  # name, desktop px, phone px, weight, tracking, upper, sample
    ("t-title   (page title)",        19, 20, 700, "-0.02em", False, "Edit profile"),
    ("t-sub     (sub line)",          13, 13, 400, "0",       False, "The Visual Science Communication Network"),
    ("t-name    (member name)",       15, 14, 500, "-0.01em", False, "Joshua Binswanger"),
    ("t-heading (section)",           12, 13, 600, "0.05em",  True,  "What we're building"),
    ("t-label   (field label)",       10, 10, 600, "0.08em",  True,  "Title · Description"),
    ("t-meta    (role, details)",     11, 12, 500, "0",       False, "Scientific illustrator · Zürich"),
    ("t-caption (image caption)",     14, 13, 400, "0",       False, "Cross-section of a mouse cochlea"),
    ("t-body    (paragraph)",         14, 13, 400, "0",       False, "Images make research accessible, spark curiosity, and build bridges."),
    ("t-link    (small link)",        10, 10, 600, "0.02em",  False, "View profile"),
    ("t-count   (pager 2 / 7)",       11, 11, 400, "0.03em",  False, "‹ 2 / 7 ›"),
    ("t-chip    (key, value chip)",    9,  9, 500, "0.03em",  True,  "Size · Move · Work"),
    ("t-nav     (header links)",      12, 13, 600, "0.04em",  True,  "Info · Community · Login"),
    ("t-tag     (tag pill)",           9,  9, 400, "0.06em",  True,  "Illustration · Neuroscience"),
]

def svg(path):
    W, pad = 1200, 48
    y = pad
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="1700" viewBox="0 0 {W} 1700" font-family="Archivo, sans-serif">',
             f'<rect width="{W}" height="1700" fill="#fcfbfa"/>']
    def text(x, yy, s, size=12, weight=400, fill="#000", extra=""):
        s = s.replace("&", "&amp;").replace("<", "&lt;")
        parts.append(f'<text x="{x}" y="{yy}" font-size="{size}" font-weight="{weight}" fill="{fill}" {extra}>{s}</text>')
    text(pad, y + 20, "VSCN — design tokens (dev, 2026-10-25)", 24, 700); y += 60
    text(pad, y, "COLOURS", 10, 600, "#686868", 'letter-spacing="1"'); y += 16
    x = pad
    for label, hexv in COLORS:
        parts.append(f'<rect x="{x}" y="{y}" width="120" height="72" rx="14" fill="{hexv}" stroke="#e0e0e0"/>')
        text(x, y + 90, label.split(" / ")[0], 11, 600); text(x, y + 104, hexv, 10, 400, "#686868")
        x += 136
    y += 140
    text(pad, y, "RADII", 10, 600, "#686868", 'letter-spacing="1"'); y += 16
    radii = [("square (site default)", 0), ("tag  0.5em", 6), ("key  0.65rem", 8), ("card  0.9rem", 12), ("soft card  1.1rem", 14), ("soft block  1.6rem", 21), ("pill  999px", 999)]
    x = pad
    for label, r in radii:
        parts.append(f'<rect x="{x}" y="{y}" width="120" height="42" rx="{min(r,21)}" fill="none" stroke="#000" stroke-width="1.5"/>')
        text(x, y + 60, label, 10, 500); x += 136
    y += 100
    text(pad, y, "TYPE SCALE — Archivo (variable).  Desktop px / phone px.  Root 13px desktop, 12px phone.", 10, 600, "#686868", 'letter-spacing="1"'); y += 28
    for name, d, p, wgt, trk, up, sample in VOICES:
        s = sample.upper() if up else sample
        text(pad, y, f"{name:<28}", 10, 400, "#686868", 'xml:space="preserve"')
        text(pad + 230, y, f"{d} / {p}px  w{wgt}  {trk}", 10, 400, "#686868")
        text(pad + 430, y, s, d, wgt, "#000", f'letter-spacing="{trk}"' if trk != "0" else "")
        y += max(d + 18, 30)
    y += 20
    text(pad, y, "LAYOUT", 10, 600, "#686868", 'letter-spacing="1"'); y += 18
    for line in ["Header 56px desktop / 48px phone · page measure --shell-max 900px, 15px gutters · works column 48rem",
                 "Breakpoints: phone = width ≤ 767px OR coarse pointer (iPad counts as phone); desktop otherwise",
                 "Editor keys 38px (36/32 on phone) · bar pills 36px · bar radius 24px · pager chevrons 0.38rem"]:
        text(pad, y, line, 12); y += 20
    parts.append("</svg>")
    open(path, "w", encoding="utf-8").write("\n".join(parts))

ase("vscn.ase"); svg("spec-board.svg"); print("ok")
