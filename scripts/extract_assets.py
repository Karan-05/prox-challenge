#!/usr/bin/env python3
"""One-time asset extraction: renders every manual page to PNG and crops the
key figures the agent can surface. Outputs are committed to the repo, so
evaluators never need to run this. Requires: poppler (pdftoppm) + Pillow.

Usage: python3 scripts/extract_assets.py
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
FILES = ROOT / "files"
PAGES = ROOT / "web" / "public" / "manual" / "pages"
FIGS = ROOT / "web" / "public" / "manual" / "figures"
DPI = 150

# (figure id, source, page, (l, t, r, b) as fractions of page, title)
CROPS = [
    ("front-panel-controls", "manual", 8, (0.03, 0.07, 0.94, 0.86), "Front Panel Controls"),
    ("interior-controls", "manual", 9, (0.03, 0.04, 0.94, 0.55), "Interior Controls (wire feed compartment)"),
    ("spool-loading-small", "manual", 10, (0.40, 0.63, 0.98, 0.93), "1-2 lb Wire Spool Loading"),
    ("spool-loading-large", "manual", 11, (0.40, 0.03, 0.98, 0.42), "10-12 lb Wire Spool Loading (with adapter)"),
    ("feed-tensioner-idler", "manual", 11, (0.42, 0.72, 0.99, 0.92), "Feed Tensioner and Idler Arm"),
    ("feed-roller-grooves", "manual", 12, (0.37, 0.27, 0.70, 0.66), "Feed Roller grooves: solid-core V-groove vs flux-cored knurled"),
    ("polarity-dcen-flux-cored", "manual", 13, (0.30, 0.55, 0.99, 0.99), "DCEN polarity hookup for Flux-Cored (gasless) welding"),
    ("polarity-dcep-mig", "manual", 14, (0.28, 0.02, 0.99, 0.36), "DCEP polarity hookup for solid-core MIG (gas) welding"),
    ("gas-cylinder-setup", "manual", 14, (0.30, 0.36, 0.99, 0.90), "Shielding gas cylinder and regulator setup"),
    ("wire-threading", "manual", 15, (0.28, 0.18, 0.98, 0.55), "Threading welding wire into the feed mechanism"),
    ("duty-cycle-charts", "manual", 19, (0.50, 0.05, 0.98, 0.46), "Rated duty cycle clocks: 120VAC and 240VAC"),
    ("ground-clamp-workpiece", "manual", 19, (0.40, 0.70, 0.99, 0.94), "Ground clamp to bare metal on workpiece"),
    ("lcd-settings-flow", "manual", 20, (0.03, 0.28, 0.98, 0.98), "LCD settings screens: process, polarity/gas, diameter/thickness, auto weld"),
    ("gun-angles-push-drag", "manual", 22, (0.42, 0.28, 0.99, 0.78), "MIG gun angles: fillet/butt joints and push vs drag"),
    ("tig-setup-cables", "manual", 24, (0.03, 0.25, 0.98, 0.80), "TIG setup: torch in negative socket, ground clamp in positive"),
    ("tungsten-sharpening", "manual", 26, (0.55, 0.06, 0.99, 0.32), "Sharpening the tungsten electrode"),
    ("tig-torch-assembly", "manual", 26, (0.35, 0.40, 0.99, 0.75), "TIG torch assembly (collet, collet body, ceramic nozzle)"),
    ("stick-setup-cables", "manual", 27, (0.03, 0.08, 0.98, 0.52), "Stick setup: electrode holder in positive socket, ground clamp in negative"),
    ("strike-test", "manual", 34, (0.40, 0.25, 0.99, 0.60), "Strike test: good weld bends, poor weld snaps"),
    ("weld-penetration-scale", "manual", 35, (0.02, 0.04, 0.96, 0.32), "Weld penetration: inadequate / proper / excess, with corrections"),
    ("wire-weld-examples", "manual", 35, (0.02, 0.35, 0.96, 0.99), "Example wire weld diagrams: good weld + 5 defect patterns"),
    ("wire-weld-porosity", "manual", 37, (0.03, 0.04, 0.52, 0.18), "Wire weld porosity: small cavities or holes in the bead"),
    ("stick-weld-examples", "manual", 38, (0.02, 0.35, 0.96, 0.85), "Example stick weld diagrams: good weld + 6 defect patterns"),
    ("wiring-schematic", "manual", 45, (0.02, 0.03, 0.96, 0.98), "Wiring schematic"),
    ("assembly-diagram", "manual", 47, (0.02, 0.03, 0.96, 0.90), "Assembly diagram (exploded parts view)"),
    ("qs-cable-stick", "quickstart", 2, (0.02, 0.10, 0.98, 0.38), "Quick start: Stick cable setup"),
    ("qs-cable-mig-flux", "quickstart", 2, (0.02, 0.38, 0.98, 0.68), "Quick start: MIG + Flux cable setup"),
    ("qs-cable-tig", "quickstart", 2, (0.02, 0.68, 0.98, 0.99), "Quick start: TIG cable setup"),
    ("selection-chart", "chart", 1, (0.0, 0.28, 1.0, 0.72), "Welding process selection chart (How to choose)"),
]

SOURCES = {
    "manual": FILES / "owner-manual.pdf",
    "quickstart": FILES / "quick-start-guide.pdf",
    "chart": FILES / "selection-chart.pdf",
}


def render_pages():
    PAGES.mkdir(parents=True, exist_ok=True)
    for key, pdf in SOURCES.items():
        prefix = PAGES / key
        subprocess.run(
            ["pdftoppm", "-png", "-r", str(DPI), str(pdf), str(prefix)],
            check=True,
        )
    # normalize names: manual-01.png etc (pdftoppm pads by page count)
    for p in sorted(PAGES.glob("*.png")):
        stem, num = p.stem.rsplit("-", 1)
        p.rename(PAGES / f"{stem}-{int(num):02d}.png")


def crop_figures():
    FIGS.mkdir(parents=True, exist_ok=True)
    for fid, src, page, (l, t, r, b), _ in CROPS:
        img = Image.open(PAGES / f"{src}-{page:02d}.png")
        w, h = img.size
        box = (int(l * w), int(t * h), int(r * w), int(b * h))
        img.crop(box).save(FIGS / f"{fid}.png", optimize=True)


def contact_sheet():
    """Labelled grid of all crops for visual verification."""
    thumbs = []
    for fid, *_ in CROPS:
        im = Image.open(FIGS / f"{fid}.png")
        im.thumbnail((330, 260))
        thumbs.append((fid, im))
    cols = 5
    rows = (len(thumbs) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * 340, rows * 300), "white")
    d = ImageDraw.Draw(sheet)
    for i, (fid, im) in enumerate(thumbs):
        x, y = (i % cols) * 340 + 5, (i // cols) * 300 + 5
        sheet.paste(im, (x, y))
        d.rectangle((x - 1, y - 1, x + 331, y + 261), outline="red")
        d.text((x, y + 268), fid, fill="black")
    sheet.save(ROOT / "scripts" / "_contact_sheet.png")


def write_catalog():
    catalog = []
    for fid, src, page, _, title in CROPS:
        catalog.append({
            "id": fid,
            "file": f"/manual/figures/{fid}.png",
            "source": {"manual": "owner-manual.pdf", "quickstart": "quick-start-guide.pdf", "chart": "selection-chart.pdf"}[src],
            "page": page,
            "title": title,
        })
    out = ROOT / "data" / "figures.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(catalog, indent=2))


if __name__ == "__main__":
    render_pages()
    crop_figures()
    contact_sheet()
    write_catalog()
    print("done:", len(CROPS), "figures,", len(list(PAGES.glob('*.png'))), "pages")
