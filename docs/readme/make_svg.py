#!/usr/bin/env python3
"""Build Datum's README header images: docs/readme/sheet.svg (desktop) and sheet-mobile.svg (phone).

    python3 docs/readme/make_svg.py

Drawn as an engineering drawing sheet: blueprint ground, a framed border with zone
markers, dimension lines, a parts list and a title block. Stdlib only (Pillow, when
installed, shrinks the embedded screenshots). Screenshots come from docs/readme/shots/,
made by docs/readme/shoot.cjs. The animations are plain CSS (linework draws itself in,
labels settle) and switch off for people who ask for reduced motion.
"""
import base64
import html
import io
import json
import textwrap
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SHOTS = HERE / "shots"
SITE = "datum.ashiswadhwani.in"
VERSION = json.loads((ROOT / "package.json").read_text())["version"]

# ---------------------------------------------------------------- palette (blueprint)
GROUND, GROUND_2 = "#0b2545", "#0e2c52"
GRID = "#c9dcf5"
INK, INK_2, INK_3 = "#eef5ff", "#a9c4e6", "#6f93bd"
CYAN, AMBER = "#7fd3f7", "#ffc857"
MONO = "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, 'Liberation Mono', monospace"
SANS = "'Geist', Inter, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
TS = 1.3

BRIEF = ("Describe a part in plain English. An LLM writes parametric Replicad code, OpenCascade "
         "builds an exact solid right in your browser, and you export STEP or STL.")

PIPELINE = [
    ("01", "PROMPT", ["plain English", "or an edit"]),
    ("02", "GEMINI", ["writes Replicad", "code + params"]),
    ("03", "KERNEL", ["OpenCascade WASM", "in a Web Worker"]),
    ("04", "VIEWPORT", ["mesh for display", "three.js"]),
    ("05", "EXPORT", ["exact BREP", "STEP / STL"]),
]

PARTS = [
    ("Exact solids", "BREP from OpenCascade is the source of truth, not a mesh."),
    ("Parametric sliders", "Every dimension is a parameter; drags rebuild locally, no AI call."),
    ("Self-correction", "Kernel errors go back to the model, which fixes its own code."),
    ("Edit by talking", "Follow-up prompts change only what you ask for."),
    ("Real exports", "STEP for CAD tools, binary STL for slicers."),
    ("Off the main thread", "The kernel runs in a Web Worker with a build timeout."),
]

STACK = ["Next.js", "React 19", "TypeScript", "Replicad", "OpenCascade.js", "three.js",
         "React Three Fiber", "Tailwind CSS", "Gemini", "Vercel"]

SHOT_DESKTOP = "desktop-model"
SHOT_MOBILE = "mobile-model"


def esc(s):
    return html.escape(str(s), quote=False)


def img_uri(name, width):
    raw = (SHOTS / f"{name}.png").read_bytes()
    mime = "image/png"
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(raw)).convert("RGB")
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=82, optimize=True, progressive=True)
        raw, mime = buf.getvalue(), "image/jpeg"
    except ImportError:
        pass
    w, h = _size(raw)
    return f"data:{mime};base64," + base64.b64encode(raw).decode(), w, h


def _size(raw):
    try:
        from PIL import Image
        return Image.open(io.BytesIO(raw)).size
    except ImportError:  # PNG header
        return int.from_bytes(raw[16:20], "big"), int.from_bytes(raw[20:24], "big")


class Sheet:
    def __init__(self, mobile):
        self.m = mobile
        self.W = 480 if mobile else 960
        self.M = 14 if mobile else 24          # outer frame inset
        self.B = 30 if mobile else 48          # inner border inset (zone band between)
        self.LX = self.B + (16 if mobile else 26)
        self.RX = self.W - self.LX
        self.out = []

    # ------------------------------------------------------------ primitives
    def add(self, s):
        self.out.append(s)

    def text(self, x, y, s, size, fill=INK, family=MONO, anchor="start", spacing=0, weight=None, extra=""):
        a = f' text-anchor="{anchor}"' if anchor != "start" else ""
        sp = f' letter-spacing="{spacing}"' if spacing else ""
        w = f' font-weight="{weight}"' if weight else ""
        self.add(f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" fill="{fill}"{w}{a}{sp}{extra}>{esc(s)}</text>')

    def rise(self, d):
        self.add(f'<g class="rise" style="--d:{d * TS:.2f}s">')

    def end(self):
        self.add("</g>")

    def draw(self, d, path, stroke=INK, width=1.2, extra=""):
        """A path that draws itself in."""
        self.add(f'<path class="draw" pathLength="1" style="--d:{d * TS:.2f}s" d="{path}" stroke="{stroke}" '
                 f'stroke-width="{width}" fill="none"{extra}/>')

    def dim_h(self, x0, x1, y, label, d, size=11):
        """Horizontal dimension line with arrowheads and a centred label."""
        self.draw(d, f"M{x0} {y}H{x1}", INK_2, 1)
        self.rise(d + .2)
        self.add(f'<path d="M{x0} {y}l7 -3v6zM{x1} {y}l-7 -3v6z" fill="{INK_2}"/>')
        mid = (x0 + x1) / 2
        w = len(label) * size * .62 + 14
        self.add(f'<rect x="{mid - w / 2:.1f}" y="{y - size}" width="{w:.1f}" height="{size * 2 - 2}" fill="{GROUND}"/>')
        self.text(f"{mid:.1f}", y + size * .36, label, size, INK_2, MONO, "middle", 1)
        self.end()

    def section(self, y, n, title, d):
        self.rise(d)
        self.text(self.LX, y, f"{n:02d}", 12 if self.m else 13, AMBER, MONO, spacing=1.5)
        self.text(self.LX + (26 if self.m else 30), y, title, 12 if self.m else 13, INK_2, MONO, spacing=2.2)
        self.end()
        self.draw(d, f"M{self.LX} {y + 12}H{self.RX}", INK, .6, ' stroke-opacity=".35"')

    def wrap(self, s, n):
        return textwrap.wrap(s, n, break_on_hyphens=False)

    # ------------------------------------------------------------ blocks
    def header(self):
        m, LX, RX = self.m, self.LX, self.RX
        y = self.B + (34 if m else 44)
        self.rise(0)
        self.text(LX, y, f"DWG NO. DTM-001 · REV {VERSION}", 11 if m else 12, INK_3, MONO, spacing=1.6)
        if not m:
            self.text(RX, y, "TEXT → SOLID · IN THE BROWSER", 12, INK_3, MONO, "end", 1.6)
        self.end()

        # the part glyph: an isometric cube with a bore, drawn line by line
        s = 34 if m else 50
        cx, cy = LX + s, y + (60 if m else 86)
        import math
        c, sn = math.cos(math.radians(30)), .5
        top = [(cx, cy - s), (cx + s * c, cy - s * sn), (cx, cy), (cx - s * c, cy - s * sn)]
        p = lambda pts: "M" + "L".join(f"{a:.1f} {b:.1f}" for a, b in pts) + "Z"
        self.draw(.15, p(top), CYAN, 1.6)
        self.draw(.3, p([(cx - s * c, cy - s * sn), (cx, cy), (cx, cy + s), (cx - s * c, cy + s * sn)]), CYAN, 1.6)
        self.draw(.45, p([(cx, cy), (cx + s * c, cy - s * sn), (cx + s * c, cy + s * sn), (cx, cy + s)]), CYAN, 1.6)
        self.draw(.6, f"M{cx - s * .32 * c:.1f} {cy - s * .5:.1f}a{s * .32:.1f} {s * .19:.1f} 0 1 0 {s * .64 * c:.1f} 0"
                      f"a{s * .32:.1f} {s * .19:.1f} 0 1 0 {-s * .64 * c:.1f} 0", CYAN, 1.3)
        # centre lines through the bore
        self.draw(.7, f"M{cx} {cy - s * .5 - s * .42:.1f}V{cy - s * .5 + s * .42:.1f}", AMBER, .8, ' stroke-dasharray="6 3 1 3"')

        tx = cx + s + (22 if m else 34)
        self.rise(.25)
        ts = 54 if m else 96
        self.text(tx, cy + ts * .36, "DATUM", ts, INK, MONO, weight=700, spacing=6 if m else 10)
        self.end()
        title_w = 5 * ts * .6 + 4 * (6 if m else 10)
        self.dim_h(tx, tx + title_w, cy + (58 if m else 86), "TYPE IT · BUILD IT", .55, 10 if m else 11)

        y = cy + s + (68 if m else 96)
        self.rise(.8)
        self.text(LX, y, "Describe a part. Get a real solid.", 22 if m else 30, INK, SANS, weight=600, spacing=-.2)
        self.end()
        y += 36 if m else 44
        lines = self.wrap(BRIEF, 46 if m else 86)
        self.rise(.95)
        for i, ln in enumerate(lines):
            self.text(LX, y + i * (24 if m else 28), ln, 15.5 if m else 18, INK_2, SANS)
        self.end()
        y += (len(lines) - 1) * (24 if m else 28) + (46 if m else 56)

        specs = [("RUNS IN", "your browser", "no install, no account"),
                 ("KERNEL", "OpenCascade", "compiled to WebAssembly"),
                 ("OUTPUT", "STEP · STL", "from the exact solid")]
        self.rise(1.1)
        cols = 1 if m else 3
        cw = (RX - LX + 12) / cols if not m else (RX - LX + 12)
        for i, (k, v, sub) in enumerate(specs):
            x = LX + (i % cols) * cw
            yy = y + (i // cols) * 78
            self.add(f'<rect x="{x:.1f}" y="{yy - 18}" width="{cw - 12:.1f}" height="66" fill="none" stroke="{INK}" stroke-opacity=".35"/>')
            self.text(f"{x + 12:.1f}", yy, k, 10.5, INK_3, MONO, spacing=1.6)
            self.text(f"{x + 12:.1f}", yy + 21, v, 15 if m else 16, INK, MONO)
            self.text(f"{x + 12:.1f}", yy + 36, sub, 11 if m else 11.5, INK_3, MONO)
        self.end()
        return y + ((len(specs) + cols - 1) // cols) * 78 + (26 if m else 34)

    def pipeline(self, y):
        m, LX, RX = self.m, self.LX, self.RX
        self.section(y, 1, "HOW A PART GETS MADE", 1.3)
        y += 46 if m else 52
        if not m:
            n = len(PIPELINE)
            gap = 22
            bw = (RX - LX - gap * (n - 1)) / n
            bh = 92
            for i, (num, name, sub) in enumerate(PIPELINE):
                x = LX + i * (bw + gap)
                hot = name in ("KERNEL",)
                self.draw(1.4 + i * .12, f"M{x:.1f} {y}h{bw:.1f}v{bh}h{-bw:.1f}Z", CYAN if hot else INK, 1.3 if hot else 1)
                self.rise(1.5 + i * .12)
                self.text(f"{x + 12:.1f}", y + 22, num, 10.5, AMBER, MONO, spacing=1.4)
                self.text(f"{x + 12:.1f}", y + 46, name, 14.5, INK, MONO, weight=700, spacing=1.2)
                for k, ln in enumerate(sub):
                    self.text(f"{x + 12:.1f}", y + 66 + k * 15, ln, 11, INK_2, MONO)
                self.end()
                if i < n - 1:
                    ax = x + bw
                    self.draw(1.6 + i * .12, f"M{ax:.1f} {y + bh / 2}h{gap - 2}", INK_2, 1.2, ' marker-end="url(#arr)"')
            # loops: self-correction (kernel -> gemini) and sliders (viewport -> kernel)
            k_x = LX + 2 * (bw + gap)
            g_x = LX + 1 * (bw + gap)
            v_x = LX + 3 * (bw + gap)
            ly = y + bh + 30
            self.draw(2.2, f"M{k_x + bw / 2:.1f} {y + bh}V{ly}H{g_x + bw / 2:.1f}V{y + bh + 4}", AMBER, 1.1,
                      ' stroke-dasharray="5 4" marker-end="url(#arrA)"')
            self.draw(2.35, f"M{v_x + bw / 2:.1f} {y + bh}V{ly + 26}H{k_x + bw * .72:.1f}V{y + bh + 4}", CYAN, 1.1,
                      ' stroke-dasharray="5 4" marker-end="url(#arrC)"')
            self.rise(2.5)
            ax_ = g_x + bw / 2 - 12
            self.text(f"{ax_:.1f}", ly - 3, "build error → the model", 11, AMBER, MONO, "end")
            self.text(f"{ax_:.1f}", ly + 13, "fixes its code (2 retries)", 11, AMBER, MONO, "end")
            cx_ = v_x + bw / 2 + 12
            self.text(f"{cx_:.1f}", ly + 14, "slider drag → local", 11, CYAN, MONO)
            self.text(f"{cx_:.1f}", ly + 30, "rebuild, no AI call", 11, CYAN, MONO)
            self.end()
            return ly + 66
        # mobile: vertical stack
        bw, bh, step = RX - LX, 56, 74
        for i, (num, name, sub) in enumerate(PIPELINE):
            yy = y + i * step
            hot = name == "KERNEL"
            self.draw(1.4 + i * .12, f"M{LX} {yy}h{bw}v{bh}h{-bw}Z", CYAN if hot else INK, 1.3 if hot else 1)
            self.rise(1.5 + i * .12)
            self.text(LX + 12, yy + 23, num, 10.5, AMBER, MONO, spacing=1.4)
            self.text(LX + 44, yy + 24, name, 14.5, INK, MONO, weight=700, spacing=1.2)
            self.text(LX + 44, yy + 43, " · ".join(sub), 11, INK_2, MONO)
            self.end()
            if i < len(PIPELINE) - 1:
                self.draw(1.6 + i * .12, f"M{LX + 26} {yy + bh}v{step - bh - 2}", INK_2, 1.2, ' marker-end="url(#arr)"')
        ye = y + (len(PIPELINE) - 1) * step + bh
        self.draw(2.2, f"M{RX - 10} {y + 2 * step + bh / 2}h14V{y + step + bh / 2}h-12", AMBER, 1.1,
                  ' stroke-dasharray="5 4" marker-end="url(#arrA)"')
        self.rise(2.4)
        self.text(LX, ye + 30, "↺ build error → the model fixes its code", 11.5, AMBER, MONO)
        self.text(LX, ye + 50, "↺ slider drag → local rebuild, no AI call", 11.5, CYAN, MONO)
        self.end()
        return ye + 96

    def detail(self, y):
        m, LX, RX = self.m, self.LX, self.RX
        self.section(y, 2, "DETAIL A · THE WORKBENCH", 2.5)
        y += 40 if m else 46
        name = SHOT_MOBILE if m else SHOT_DESKTOP
        fw = (RX - LX) * (.62 if m else 1)
        uri, iw, ih = img_uri(name, int(fw * 2))
        fh = fw * ih / iw
        x = LX + ((RX - LX) - fw) / 2
        self.rise(2.6)
        self.add(f'<clipPath id="shot{int(m)}"><rect x="{x:.1f}" y="{y}" width="{fw:.1f}" height="{fh:.1f}" rx="{14 if m else 6}"/></clipPath>')
        self.add(f'<image href="{uri}" x="{x:.1f}" y="{y}" width="{fw:.1f}" height="{fh:.1f}" clip-path="url(#shot{int(m)})"/>')
        self.add(f'<rect x="{x:.1f}" y="{y}" width="{fw:.1f}" height="{fh:.1f}" rx="{14 if m else 6}" fill="none" stroke="{INK}" stroke-opacity=".6"/>')
        self.end()
        # balloons calling out the three panes
        if not m:
            balloons = [(.12, .3, "1", "conversation"), (.52, .5, "2", "exact solid"), (.9, .3, "3", "parameters")]
        else:
            balloons = [(.5, .28, "2", "exact solid")]
        for i, (fx, fy, n, lab) in enumerate(balloons):
            bx, by = x + fw * fx, y + fh * fy
            lx = bx + (40 if fx < .6 else -40) if not m else x + fw + 34
            ly = y - 22 if not m else by
            if not m:
                self.draw(3 + i * .15, f"M{bx:.1f} {by:.1f}L{lx:.1f} {ly + 12:.1f}", AMBER, 1)
            else:
                self.draw(3, f"M{bx:.1f} {by:.1f}L{lx - 13:.1f} {ly:.1f}", AMBER, 1)
            self.rise(3.1 + i * .15)
            self.add(f'<circle cx="{bx:.1f}" cy="{by:.1f}" r="3" fill="{AMBER}"/>')
            self.add(f'<circle cx="{lx:.1f}" cy="{ly:.1f}" r="12" fill="{GROUND}" stroke="{AMBER}" stroke-width="1.2"/>')
            self.text(f"{lx:.1f}", f"{ly + 4:.1f}", n, 12, AMBER, MONO, "middle", weight=700)
            if not m:
                self.text(f"{lx + (18 if fx < .6 else -18):.1f}", f"{ly + 4:.1f}", lab.upper(), 10.5, INK_2, MONO,
                          "start" if fx < .6 else "end", 1.4)
            self.end()
        y += fh
        self.dim_h(x, x + fw, y + 26, "ONE PAGE · NO INSTALL" if not m else "PHONE · 390 PX", 3.2, 10 if m else 11)
        return y + (64 if m else 72)

    def parts_list(self, y):
        m, LX, RX = self.m, self.LX, self.RX
        self.section(y, 3, "PARTS LIST", 3.4)
        y += 30 if m else 34
        w = RX - LX
        c1 = 44 if m else 56
        c2 = (w * (.36 if not m else 1)) if not m else w
        row_h_desk = 40
        self.rise(3.5)
        # header row
        self.add(f'<rect x="{LX}" y="{y}" width="{w}" height="28" fill="{INK}" fill-opacity=".08" stroke="{INK}" stroke-opacity=".5"/>')
        self.text(LX + 12, y + 18, "ITEM", 10.5, INK_3, MONO, spacing=1.5)
        self.text(LX + c1 + 12, y + 18, "FEATURE", 10.5, INK_3, MONO, spacing=1.5)
        if not m:
            self.text(LX + c1 + c2 + 12, y + 18, "NOTE", 10.5, INK_3, MONO, spacing=1.5)
        yy = y + 28
        for i, (feat, note) in enumerate(PARTS):
            note_lines = self.wrap(note, 44) if m else [note]
            h = (36 + 18 * len(note_lines)) if m else row_h_desk
            self.add(f'<rect x="{LX}" y="{yy}" width="{w}" height="{h}" fill="none" stroke="{INK}" stroke-opacity=".35"/>')
            self.add(f'<path d="M{LX + c1} {yy}v{h}" stroke="{INK}" stroke-opacity=".35"/>')
            self.text(LX + c1 / 2, yy + (25 if not m else 22), f"{i + 1}", 12, AMBER, MONO, "middle", weight=700)
            if not m:
                self.add(f'<path d="M{LX + c1 + c2} {yy}v{h}" stroke="{INK}" stroke-opacity=".35"/>')
                self.text(LX + c1 + 12, yy + 25, feat, 14, INK, SANS, weight=600)
                self.text(LX + c1 + c2 + 12, yy + 25, note, 12.5, INK_2, SANS)
            else:
                self.text(LX + c1 + 12, yy + 22, feat, 14, INK, SANS, weight=600)
                for k, ln in enumerate(note_lines):
                    self.text(LX + c1 + 12, yy + 42 + k * 18, ln, 12.5, INK_2, SANS)
            yy += h
        self.end()
        return yy + (40 if m else 46)

    def stack(self, y):
        m, LX, RX = self.m, self.LX, self.RX
        self.section(y, 4, "MATERIALS", 3.8)
        y += 32 if m else 36
        self.rise(3.9)
        x, top = LX, y
        size = 12.5 if m else 13.5
        for c in STACK:
            w = len(c) * size * .6 + 24
            if x + w > RX and x > LX:
                x, top = LX, top + 42
            self.add(f'<rect x="{x:.0f}" y="{top}" width="{w:.0f}" height="30" fill="none" stroke="{INK}" stroke-opacity=".55"/>')
            self.text(f"{x + w / 2:.0f}", top + 20, c, size, INK, MONO, "middle")
            x += w + 10
        self.end()
        return top + 30 + (40 if m else 46)

    def title_block(self, y):
        m, LX, RX = self.m, self.LX, self.RX
        w = RX - LX if m else 470
        x = RX - w
        rows = [("PROJECT", "Datum"), ("DRAWN BY", "ashis05"), ("UNITS", "mm"),
                ("SCALE", "1:1"), ("REV", VERSION), ("SHEET", "1 OF 1")]
        rh = 30
        cols = 2
        cw = w / cols
        self.rise(4.1)
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{rh * 4}" fill="{GROUND_2}" stroke="{INK}" stroke-width="1.4"/>')
        self.add(f'<rect x="{x}" y="{y + rh * 3}" width="{w}" height="{rh}" fill="none" stroke="{INK}" stroke-opacity=".45"/>')
        self.text(f"{x + 10:.1f}", y + rh * 3 + 19, "SITE", 9.5, INK_3, MONO, spacing=1.4)
        self.text(f"{x + w - 10:.1f}", y + rh * 3 + 20, SITE, 12.5, CYAN, MONO, "end")
        for i, (k, v) in enumerate(rows):
            cx = x + (i % cols) * cw
            cy = y + (i // cols) * rh
            self.add(f'<rect x="{cx:.1f}" y="{cy}" width="{cw:.1f}" height="{rh}" fill="none" stroke="{INK}" stroke-opacity=".45"/>')
            self.text(f"{cx + 10:.1f}", cy + 19, k, 9.5, INK_3, MONO, spacing=1.4)
            self.text(f"{cx + cw - 10:.1f}", cy + 20, v, 12.5, INK, MONO, "end")
        if not m:
            self.text(LX, y + 40, "Units in millimetres.", 12, INK_3, MONO)
            self.text(LX, y + 60, "Open source under MIT.", 12, INK_3, MONO)
        self.end()
        return y + rh * 4

    # ------------------------------------------------------------ frame
    def build(self):
        body_start = len(self.out)
        y = self.header()
        y = self.pipeline(y)
        y = self.detail(y)
        y = self.parts_list(y)
        y = self.stack(y)
        y = self.title_block(y)
        H = int(y + self.B + (12 if self.m else 16))
        body = self.out[body_start:]
        self.out = self.out[:body_start]
        self.frame(H)
        self.out += body
        self.add("</svg>")
        return "\n".join(self.out) + "\n", H

    def frame(self, H):
        W, M, B, m = self.W, self.M, self.B, self.m
        self.add(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Datum. '
                 f'Describe a part, get a real solid. {esc(BRIEF)}">')
        self.add("""<style>
    .rise{opacity:0;animation:rise 1s cubic-bezier(.2,.7,.2,1) var(--d,0s) forwards}
    @keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
    .draw{stroke-dasharray:1;stroke-dashoffset:1;animation:draw 1.3s cubic-bezier(.45,.1,.2,1) var(--d,0s) forwards}
    .draw[stroke-dasharray]{stroke-dashoffset:0;opacity:0;animation:fadein 1s ease-out var(--d,0s) forwards}
    @keyframes draw{to{stroke-dashoffset:0}}
    @keyframes fadein{to{opacity:1}}
    .scan{animation:scan 9s linear infinite}
    @keyframes scan{from{transform:translateY(0)}to{transform:translateY(var(--h))}}
    @media (prefers-reduced-motion:reduce){.rise,.draw,.draw[stroke-dasharray]{animation:none;opacity:1;stroke-dashoffset:0}.scan{animation:none;opacity:0}}
    </style>""")
        self.add(f"""<defs>
    <pattern id="fine" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M12 0H0V12" fill="none" stroke="{GRID}" stroke-opacity=".05"/></pattern>
    <pattern id="major" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0H0V60" fill="none" stroke="{GRID}" stroke-opacity=".09"/></pattern>
    <radialGradient id="vign" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="#174a80" stop-opacity=".55"/><stop offset="1" stop-color="{GROUND}" stop-opacity="0"/></radialGradient>
    <linearGradient id="scanG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{CYAN}" stop-opacity="0"/><stop offset="1" stop-color="{CYAN}" stop-opacity=".10"/></linearGradient>
    <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="{INK_2}"/></marker>
    <marker id="arrA" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="{AMBER}"/></marker>
    <marker id="arrC" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="{CYAN}"/></marker>
    </defs>""")
        self.add(f'<rect width="{W}" height="{H}" fill="{GROUND}"/>')
        self.add(f'<rect width="{W}" height="{H}" fill="url(#vign)"/>')
        self.add(f'<rect width="{W}" height="{H}" fill="url(#fine)"/>')
        self.add(f'<rect width="{W}" height="{H}" fill="url(#major)"/>')
        # sheet frame: outer line, inner border, zone markers between
        self.add(f'<rect x="{M}" y="{M}" width="{W - 2 * M}" height="{H - 2 * M}" fill="none" stroke="{INK}" stroke-opacity=".55"/>')
        self.add(f'<rect x="{B}" y="{B}" width="{W - 2 * B}" height="{H - 2 * B}" fill="none" stroke="{INK}" stroke-width="1.6"/>')
        cols = 4 if m else 8
        zw = (W - 2 * B) / cols
        for i in range(cols + 1):
            x = B + i * zw
            self.add(f'<path d="M{x:.1f} {M}V{B}M{x:.1f} {H - B}V{H - M}" stroke="{INK}" stroke-opacity=".5"/>')
            if i < cols:
                for yy in ((M + B) / 2 + 4, H - (M + B) / 2 + 4):
                    self.text(f"{x + zw / 2:.1f}", f"{yy:.1f}", str(i + 1), 10, INK_3, MONO, "middle")
        rows = max(3, round((H - 2 * B) / (220 if m else 260)))
        zh = (H - 2 * B) / rows
        for i in range(rows + 1):
            y = B + i * zh
            self.add(f'<path d="M{M} {y:.1f}H{B}M{W - B} {y:.1f}H{W - M}" stroke="{INK}" stroke-opacity=".5"/>')
            if i < rows:
                for xx in ((M + B) / 2, W - (M + B) / 2):
                    self.text(f"{xx:.1f}", f"{y + zh / 2 + 4:.1f}", "ABCDEFGHJKLMNP"[i], 10, INK_3, MONO, "middle")
        # centring marks on the border
        for x, y, dx, dy in ((W / 2, B, 0, -1), (W / 2, H - B, 0, 1), (B, H / 2, -1, 0), (W - B, H / 2, 1, 0)):
            self.add(f'<path d="M{x} {y}l{dx * (B - M)} {dy * (B - M)}" stroke="{INK}" stroke-width="1.6"/>')


for mobile, name in ((False, "sheet.svg"), (True, "sheet-mobile.svg")):
    svg, h = Sheet(mobile).build()
    (HERE / name).write_text(svg, encoding="utf-8")
    print(f"{name}: {480 if mobile else 960}x{h}, {len(svg) // 1024} KB")
