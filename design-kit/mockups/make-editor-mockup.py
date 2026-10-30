"""Builds desktop-editor.svg: the signed-in editor at 1440 wide, three frames.

Vocabulary is lifted from Josh's own top-bar design (Desktop/vscn-desktop-topbar.af, 10-26):
  - bar row centred at y 43; brand 20/700 at x 22; INFO / COMMUNITY 13/600 +0.5 at x 137 / 188
  - outlined pill  : 44 tall in the bar, #e0e0e0 hairline, paper fill
  - active segment : black pill, 36 tall, inset 4 inside its 44 track, paper text
  - primary pill   : black, UPPERCASE 12/600 +0.5 (SIGN UP, DONE, SAVE, + PROJECT)
  - right tabs     : ACCOUNT / PROFILE / WORK as text, the current one a black pill
  - avatar         : 40 round, black
Inside the page the same pieces run one step smaller (36 track / 28 active / 36 key) so a button
anywhere in the editor is recognisably a bar button. Cards 22, fields 14, everything clickable a pill.
"""
import os

INK, PAPER, BORDER, MUTED, PH = "#000000", "#fcfbfa", "#e0e0e0", "#686868", "#707070"
RED = "#b83232"
SOFT = "#efeeec"
IMG = "#cfc8c2"
out = []


def a(s):
    out.append(s)


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;")


def T(x, y, s, size=13, w=400, fill=INK, ls=0, anchor="start", i=None):
    idt = f' id="{i}"' if i else ""
    an = f' text-anchor="{anchor}"' if anchor != "start" else ""
    a(f'<text{idt} x="{x}" y="{y}"{an} font-family="Archivo" font-size="{size}" font-weight="{w}" '
      f'letter-spacing="{ls}" fill="{fill}">{esc(s)}</text>')


def R(x, y, w, h, r=0, fill="none", stroke=None, sw=1, i=None, dash=None):
    idt = f' id="{i}"' if i else ""
    st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    d = f' stroke-dasharray="{dash}"' if dash else ""
    a(f'<rect{idt} x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" ry="{r}" fill="{fill}"{st}{d}/>')


def C(cx, cy, r, fill="none", stroke=None, sw=1, i=None):
    idt = f' id="{i}"' if i else ""
    st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    a(f'<circle{idt} cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"{st}/>')


def L(x1, y1, x2, y2, stroke=BORDER, sw=1):
    a(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{sw}"/>')


def G(name):
    a(f'<g id="{esc(name)}">')


def E():
    a("</g>")


def label(x, y, s):  # t-label: 10 / 600 / 0.08em / upper
    T(x, y, s.upper(), 10, 600, INK, 0.8)


def pencil(x, y, col=INK):
    a(f'<path d="M{x} {y+11} l0.8 -3.4 l7.2 -7.2 l2.6 2.6 l-7.2 7.2 z" fill="none" stroke="{col}" stroke-width="1.3" stroke-linejoin="round"/>')


def plus(cx, cy, col=INK):
    a(f'<path d="M{cx-5} {cy} h10 M{cx} {cy-5} v10" stroke="{col}" stroke-width="1.5" stroke-linecap="round"/>')


# ---- components (all from the top bar) --------------------------------------------------------

def btn(x, y, w, s, icon=None, h=36, primary=False, danger=False, i=None):
    """Outlined pill, or the black primary pill (UPPERCASE) - the bar's LOGIN / SIGN UP pair."""
    if primary:
        R(x, y, w, h, h / 2, INK, i=i)
        col, txt, wt, ls = PAPER, s.upper(), 600, 0.5
    else:
        R(x, y, w, h, h / 2, PAPER, BORDER, i=i)
        col, txt, wt, ls = (RED if danger else INK), s, 500, 0
    cy = y + h / 2
    if icon == "pencil":
        pencil(x + 16, cy - 6, col)
        T(x + 36, cy + 4, txt, 12, wt, col, ls)
    elif icon == "plus":
        plus(x + 20, cy, col)
        T(x + 34, cy + 4, txt, 12, wt, col, ls)
    else:
        T(x + w / 2, cy + 4, txt, 12, wt, col, ls, "middle")


def seg(x, y, w, labels, active, h=36):
    """Segmented pill: hairline track, black active pill inset 4 (the bar's Portfolios | Images | People)."""
    R(x, y, w, h, h / 2, PAPER, BORDER, i="seg-track")
    n = len(labels)
    cw = (w - 8) / n
    for k, s in enumerate(labels):
        cx = x + 4 + cw * k
        on = k == active
        if on:
            R(cx, y + 4, cw, h - 8, (h - 8) / 2, INK)
        T(cx + cw / 2, y + h / 2 + 4, s, 12, 500, PAPER if on else INK, 0, "middle")


def roundbtn(cx, cy, glyph, d=36):
    """Round outlined key (the bar's round sort / filter buttons); arrows are drawn paths."""
    C(cx, cy, d / 2, PAPER, BORDER)
    s = -1 if glyph == "↑" else 1
    a(f'<path d="M{cx} {cy - 5*s} V{cy + 5*s} M{cx - 3.5} {cy + 1.5*s} L{cx} {cy + 5*s} L{cx + 3.5} {cy + 1.5*s}" '
      f'fill="none" stroke="{INK}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>')


def chip(x, y, w, s, on, h=28, dash=False):
    R(x, y, w, h, h / 2, INK if on else "none", None if on else BORDER, dash="3 3" if dash else None)
    T(x + w / 2, y + h / 2 + 4, s, 11, 500, PAPER if on else (MUTED if dash else INK), 0, "middle")


def field(x, y, w, h, i=None):
    R(x, y, w, h, 14, PAPER, BORDER, i=i)


# ---- header: the top-bar design, row centre y 43 ----------------------------------------------

def header(tab=None, mode="tabs"):
    """tab = 'ACCOUNT' | 'PROFILE' | 'WORK' (current one becomes the black pill).
    mode 'tabs' = right group is the three tabs; 'done' = back pill centred, Saved + DONE at right."""
    G("Header")
    T(22, 50, "VSCN", 20, 700, INK, -0.4, i="brand")
    T(137, 47, "INFO", 13, 600, INK, 0.5)
    T(188, 47, "COMMUNITY", 13, 600, INK, 0.5)
    if mode == "tabs":
        slots = [("ACCOUNT", 1096, 78), ("PROFILE", 1198, 88), ("WORK", 1292, 70)]
        for s, cx, w in slots:
            if s == tab:
                R(cx - w / 2 - 4, 25, w + 8, 36, 18, INK)
                T(cx, 47, s, 13, 600, PAPER, 0.5, "middle")
            else:
                T(cx, 47, s, 13, 600, INK, 0.5, "middle")
    else:
        R(640, 21, 160, 44, 22, PAPER, BORDER, i="back-pill")
        T(720, 48, "‹  Projects", 12, 500, INK, 0, "middle")
        T(1254, 47, "Saved", 11, 400, MUTED, 0, "end")
        R(1262, 25, 88, 36, 18, INK)
        T(1306, 47, "DONE", 13, 600, PAPER, 0.5, "middle")
    C(1392, 43, 20, INK, i="avatar")
    T(1392, 49, "R", 16, 700, PAPER, 0, "middle")
    E()


def lang_corner(h=900):
    G("EN DE corner switch")
    T(1380, h - 20, "EN", 10, 700, INK, 0.5, "end")
    T(1410, h - 20, "DE", 10, 500, MUTED, 0.5, "end")
    E()


def frame(dy, title, note, body, h=900):
    T(30, dy - 12, title, 10, 600, MUTED, 0.8)
    T(1410, dy - 12, note, 10, 400, MUTED, 0, "end")
    a(f'<g id="{esc(title)}" transform="translate(0,{dy})">')
    R(0, 0, 1440, h, 0, PAPER, BORDER, i="paper")
    body()
    E()


def thumb_strip(x, y, n, extra=None, w=118, h=88, gap=8):
    for k in range(n):
        R(x + k * (w + gap), y, w, h, 12, IMG)
    if extra:
        R(x + n * (w + gap), y, w, h, 12, "none", BORDER, dash="3 3")
        T(x + n * (w + gap) + w / 2, y + h / 2 + 4, extra, 14, 500, MUTED, 0, "middle")


# ---- screens ----------------------------------------------------------------------------------

def aside(y):
    G("Left / Profile aside")
    C(103, y + 45, 45, INK, i="portrait")
    T(103, y + 52, "R", 34, 700, PAPER, 0, "middle")
    T(58, y + 132, "Joshua Binswanger", 32, 700, INK, -1, i="name")
    T(58, y + 162, "Designer", 12, 600, INK)
    for k, s in enumerate(["Scientific illustrator specializing in 3D and web",
                           "technologies. I combine design and aesthetics to",
                           "make complex knowledge intuitively accessible.",
                           "Currently contributing to a medical learning app at",
                           "Augmedi AG."]):
        T(58, y + 208 + 19 * k, s, 11.5, 400, INK)
    rows = [[("3D", 34), ("ILLUSTRATION", 90), ("MOTION GRAPHICS", 110)],
            [("SCIENTIFIC ILLUSTRATION", 152), ("NATURAL SCIENCES", 120)],
            [("MEDICINE", 66), ("ECOLOGY", 62)]]
    for r, row in enumerate(rows):
        x = 58
        for s, w in row:
            R(x, y + 326 + r * 22, w, 18, 9, "none", BORDER)
            T(x + w / 2, y + 326 + r * 22 + 12.5, s, 9, 400, MUTED, 0.5, "middle")
            x += w + 6
    T(58, y + 424, "rhizome.ch", 12, 500, INK)
    L(58, y + 428, 123, y + 428, INK)
    T(138, y + 424, "instagram", 12, 500, INK)
    L(138, y + 428, 196, y + 428, INK)
    E()


def frame_a():
    """LEVEL 1: every project; the only control is Edit, top right of each."""
    header("WORK")
    aside(128)
    projects = [("Wood at the Nanoscale",
                 ["Visualising the hierarchical structure of wood, from the tree trunk down to cellulose",
                  "microfibrils, for a materials science outreach campaign."], "4 works", "3D · Scientific illustration"),
                ("Drinkli im Parkli", ["Poster and motion pieces for a neighbourhood bar night in Zurich."], "2 works",
                 "Illustration · Motion graphics"),
                ("Works", [], "5 works", "")]
    y = 108
    G("Centre / Project list")
    for name, desc, count, tags in projects:
        h = 58 + 20 * len(desc) + (14 if desc else 0) + 6 + 88 + 38
        G("Project card - " + name)
        R(408, y, 624, h, 26, SOFT, i="project-card")
        T(430, y + 40, name, 20, 700, INK, -0.4)
        btn(932, y + 16, 84, "Edit", "pencil", i="edit-key")
        yy = y + 58
        for k, s in enumerate(desc):
            T(430, yy + 14 + 20 * k, s, 13, 400, MUTED)
        yy += 20 * len(desc) + (14 if desc else 0)
        thumb_strip(430, yy + 6, min(int(count[0]), 4))
        T(430, y + h - 22, count.upper() + ("  ·  " + tags.upper() if tags else ""), 9, 500, MUTED, 0.6)
        E()
        y += h + 16
    E()
    G("Bottom bar")
    R(636, 826, 168, 52, 26, PAPER, BORDER, i="bar")
    R(644, 834, 152, 36, 18, INK)
    plus(676, 852, PAPER)
    T(690, 856, "PROJECT", 12, 600, PAPER, 0.5)
    E()
    lang_corner()


def block_head(x, y, w, kind):
    """Block header: grip + kind at the left; size, move, remove at the right - all pills."""
    for k in range(3):
        C(x + 22, y + 12 + k * 6, 1.4, MUTED)
        C(x + 28, y + 12 + k * 6, 1.4, MUTED)
    label(x + 44, y + 22, kind)
    rx = x + w - 16
    btn(rx - 84, y, 84, "Remove", danger=True)
    roundbtn(rx - 84 - 8 - 18, y + 18, "↓")
    roundbtn(rx - 84 - 8 - 36 - 8 - 18, y + 18, "↑")
    seg(rx - 84 - 8 - 72 - 16 - 84, y, 84, ["S", "L"], 1)


def add_block(cx, y):
    L(340, y, 1100, y, BORDER)
    R(cx - 66, y - 18, 132, 36, 18, PAPER, BORDER)
    plus(cx - 40, y, INK)
    T(cx - 26, y + 4, "Add block", 12, 500, INK)


def frame_b():
    """LEVEL 2: one project as the whole page; every block is edited in place."""
    H = 1760
    header(mode="done")
    X, W = 340, 760
    oy = 30
    G("Project header")
    label(X, 112 + oy, "Project title")
    field(X, 122 + oy, W, 56, "field-title")
    T(X + 18, 160 + oy, "Wood at the Nanoscale", 30, 700, INK, -0.8)
    label(X, 204 + oy, "Project description")
    field(X, 214 + oy, W, 84, "field-description")
    for k, s in enumerate(["Visualising the hierarchical structure of wood, from the tree trunk down to cellulose",
                           "microfibrils, for a materials science outreach campaign. I developed the visual",
                           "concept, the 3D scenes and an interactive web viewer."]):
        T(X + 18, 240 + oy + 22 * k, s, 13.5, 400, MUTED)
    label(X, 324 + oy, "Tags")
    x = X
    for s, w, on, d in [("3D", 40, True, False), ("Illustration", 84, True, False),
                        ("Scientific illustration", 150, True, False), ("+ Add tag", 82, False, True)]:
        chip(x, 334 + oy, w, s, on, 28, d)
        x += w + 8
    E()
    add_block(720, 398 + oy)
    G("Block 1 - Image")
    y = 428 + oy
    R(X, y, W, 560, 22, PAPER, BORDER, i="block")
    block_head(X, y + 16, W, "Image")
    R(X + 16, y + 62, W - 32, 330, 12, IMG, i="image")
    T(720, y + 232, "IMAGE", 11, 600, "#ffffff", 1, "middle")
    btn(X + W - 16 - 100 - 16, y + 78, 100, "Replace")
    label(X + 16, y + 418, "Title")
    field(X + 16, y + 426, W - 32, 38)
    T(X + 30, y + 450, "From tree trunk to macroland", 14, 600)
    label(X + 16, y + 484, "Description")
    field(X + 16, y + 492, W - 32, 52)
    T(X + 30, y + 514, "A zoom sequence from a spruce trunk down to individual cells.", 13, 400, MUTED)
    E()
    add_block(720, 1018 + oy)
    G("Block 2 - Text")
    y = 1048 + oy
    R(X, y, W, 230, 22, PAPER, BORDER, i="block")
    block_head(X, y + 16, W, "Text")
    field(X + 16, y + 62, W - 32, 150)
    for k, s in enumerate(["Wir mixen Negronis, Espresso Martini, Virgin Mojitos, Limonade - und alles",
                           "was die kleine Bar hergibt.", "", "Es gibt Solipreise und wir sammeln das Geld fuer die Bildung eines",
                           "Bekannten im Sudan."]):
        T(X + 30, y + 88 + 22 * k, s, 14, 400)
    E()
    add_block(720, 1298 + oy)
    G("Block 3 - Carousel")
    y = 1328 + oy
    R(X, y, W, 290, 22, PAPER, BORDER, i="block")
    block_head(X, y + 16, W, "Carousel · 3 works")
    R(X + 16, y + 62, W - 32, 112, 14, "none", BORDER, dash="3 3")
    thumb_strip(X + 28, y + 74, 3, "+", 118, 88, 10)
    label(X + 16, y + 200, "Title")
    field(X + 16, y + 208, W - 32, 38)
    T(X + 30, y + 232, "Title of the picked slide", 14, 400, PH)
    E()
    add_block(720, 1648 + oy)
    lang_corner(H)


def frame_c():
    header("PROFILE")
    G("Centre / Profile form")
    oy = 14
    C(475, 160 + oy, 35, INK, i="avatar-upload")
    T(475, 166 + oy, "R", 24, 700, PAPER, 0, "middle")
    btn(537, 140 + oy, 130, "Choose image")
    label(440, 232 + oy, "Who are you?")
    x = 440
    for s, w, on in [("Visual creator", 128, True), ("Scientist · Researcher", 176, False), ("Both", 76, False)]:
        R(x, 246 + oy, w, 36, 18, INK if on else PAPER, None if on else BORDER)
        C(x + 20, 264 + oy, 5.5, "none", PAPER if on else MUTED, 1.2)
        T(x + 34, 268 + oy, s, 12, 500, PAPER if on else INK)
        x += w + 8
    R(440, 290 + oy, 236, 36, 18, PAPER, BORDER)
    C(460, 308 + oy, 5.5, "none", MUTED, 1.2)
    T(474, 312 + oy, "Research group · Organization", 12, 500)
    yy = 364 + oy
    for name, val, ph in [("Display name", "Joshua Binswanger", False), ("Role", "Designer", False),
                          ("Affiliation", "Studio, company, or freelance", True), ("Location", "Zurich, Switzerland", True)]:
        label(440, yy, name)
        field(440, yy + 10, 560, 38)
        T(458, yy + 34, val, 13, 400, PH if ph else INK)
        if name == "Role":
            seg(928, yy - 20, 72, ["EN", "DE"], 0, 28)
        yy += 74
    label(440, yy, "Working languages")
    x = 440
    for s, w, on in [("German", 74, True), ("English", 70, True), ("French", 68, False), ("Italian", 62, False)]:
        chip(x, yy + 12, w, s, on)
        x += w + 8
    label(440, yy + 74, "About you")
    field(440, yy + 84, 560, 52)
    T(458, yy + 108, "Scientific illustrator specializing in 3D and web technologies. I combine design...", 13, 400)
    E()
    G("Bottom bar")
    R(647, 826, 146, 52, 26, PAPER, BORDER, i="bar")
    R(655, 834, 130, 36, 18, INK)
    T(720, 856, "SAVED", 12, 600, PAPER, 0.5, "middle")
    E()
    lang_corner()


os.chdir(os.path.dirname(os.path.abspath(__file__)))
HB = 1760
TOTAL = 40 + 900 + 80 + HB + 80 + 900 + 40
a(f'<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="{TOTAL}" viewBox="0 0 1440 {TOTAL}">')
a(f'<rect id="canvas" x="0" y="0" width="1440" height="{TOTAL}" fill="#e9e8e6"/>')
frame(40, "A - WORK TAB, LEVEL 1: ALL PROJECTS (1440 X 900)", "the only control is an Edit pill per project", frame_a)
frame(1020, "B - WORK TAB, LEVEL 2: ONE PROJECT AS THE WHOLE PAGE (1440 X 1760)", "every block edited in place; DONE returns to level 1", frame_b, HB)
frame(1020 + HB + 80, "C - PROFILE TAB", "same bar, PROFILE is the current tab; autosaves", frame_c)
a("</svg>")
with open("desktop-editor.svg", "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print("ok", TOTAL)
