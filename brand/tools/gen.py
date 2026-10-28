"""Generate the Skoor logo files as pure SVG shapes (no live text).

Usage: python3 -I brand/tools/gen.py <font.ttf> <out_dir>
"""
import os
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

FONT, OUT = sys.argv[1], sys.argv[2]
font = TTFont(FONT)
UPM = font['head'].unitsPerEm
CAP = font['OS/2'].sCapHeight
cmap = font.getBestCmap()
glyphs = font.getGlyphSet()

GREEN = '#22c55e'
BLACK = '#000000'
WHITE = '#fafafa'


def glyph(ch):
    name = cmap[ord(ch)]
    g = font['glyf'][name]
    return name, font['hmtx'][name][0], (g.xMin, g.yMin, g.xMax, g.yMax)


def path(ch, size, x, baseline):
    """SVG path data for one glyph at font size `size`, pen at (x, baseline)."""
    name = cmap[ord(ch)]
    s = size / UPM
    pen = SVGPathPen(glyphs, ntos=lambda v: ('%.2f' % v).rstrip('0').rstrip('.'))
    glyphs[name].draw(TransformPen(pen, (s, 0, 0, -s, x, baseline)))
    return pen.getCommands()


def num(v):
    return ('%.2f' % v).rstrip('0').rstrip('.')


def tile(x, y, w, h, r, digit_size, colours, line, mask_id=None):
    """A flip tile with a centred 0 and a split line through the middle.

    colours: (tile, digit) for a colour tile, or None for a one-colour tile where the
    digit and the line are cut out with a mask.
    """
    _, _, (x0, y0, x1, y1) = glyph('0')
    s = digit_size / UPM
    dx = x + w / 2 - (x0 + x1) / 2 * s
    base = y + h / 2 + (y0 + y1) / 2 * s
    d = path('0', digit_size, dx, base)
    ly = y + h / 2 - line / 2
    rect = f'<rect x="{num(x)}" y="{num(y)}" width="{num(w)}" height="{num(h)}" rx="{num(r)}"'
    split = f'<rect x="{num(x)}" y="{num(ly)}" width="{num(w)}" height="{num(line)}"'
    if colours:
        t, dc = colours
        return f'{rect} fill="{t}"/><path d="{d}" fill="{dc}"/>{split} fill="{dc}"/>'
    return (f'<mask id="{mask_id}" maskUnits="userSpaceOnUse">{rect} fill="#fff"/>'
            f'<path d="{d}" fill="#000"/>{split} fill="#000"/></mask>'
            f'{rect} fill="currentColor" mask="url(#{mask_id})"/>')


def wordmark(letters, tiles, one_colour=None, F=100.0):
    """SK00R: letters and two tiles. Returns (svg body, width, height)."""
    ls = 0.12 * F
    W, H = 62 / 84 * F, 94 / 84 * F
    R, line, gap = 10 / 84 * F, 3 / 84 * F, 6 / 84 * F
    s = F / UPM
    tile_mid = CAP * s / 2  # tiles are centred on the capital height
    top = 0.0
    baseline = H / 2 + tile_mid
    parts = []
    _, _, (sx0, _, _, _) = glyph('S')
    x = -sx0 * s  # start the drawing at the left edge of the S
    fill = one_colour or letters
    for ch in 'SK':
        _, adv, _ = glyph(ch)
        parts.append(f'<path d="{path(ch, F, x, baseline)}" fill="{fill}"/>')
        x += adv * s + ls
    for i in range(2):
        cols = None if one_colour else tiles
        parts.append(tile(x, top, W, H, R, F, cols, line, mask_id=f'm{i}'))
        x += W + (gap if i == 0 else ls)
    _, _, (_, _, rx1, _) = glyph('R')
    parts.append(f'<path d="{path("R", F, x, baseline)}" fill="{fill}"/>')
    width = x + rx1 * s
    return ''.join(parts), width, H


def svg(body, w, h, extra=''):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {num(w)} {num(h)}" '
            f'width="{num(w)}" height="{num(h)}"{extra}>{body}</svg>\n')


def icon(N=512, rounded=True, scale=1.0):
    """App icon: two green tiles on black."""
    k = N / 180 * scale
    tw, th, g, r = 73 * k, 108 * k, 8 * k, 12 * k
    x = (N - (2 * tw + g)) / 2
    y = (N - th) / 2
    bg = f'<rect width="{N}" height="{N}"' + (f' rx="{num(N * 0.208)}"' if rounded else '') + f' fill="{BLACK}"/>'
    t1 = tile(x, y, tw, th, r, 96 * k, (GREEN, BLACK), 4 * k)
    t2 = tile(x + tw + g, y, tw, th, r, 96 * k, (GREEN, BLACK), 4 * k)
    return svg(bg + t1 + t2, N, N)


def favicon():
    """16 px favicon: two plain green blocks; digits do not survive this size."""
    body = (f'<rect width="16" height="16" rx="4" fill="{BLACK}"/>'
            f'<rect x="1.75" y="3" width="5.75" height="10" rx="1.5" fill="{GREEN}"/>'
            f'<rect x="8.5" y="3" width="5.75" height="10" rx="1.5" fill="{GREEN}"/>')
    return svg(body, 16, 16)


def write(name, text):
    with open(os.path.join(OUT, name), 'w') as f:
        f.write(text)


os.makedirs(OUT, exist_ok=True)
for name, letters, one in [
    ('skoor-logo-on-dark.svg', WHITE, None),
    ('skoor-logo-on-light.svg', BLACK, None),
]:
    body, w, h = wordmark(letters, (GREEN, BLACK), one)
    write(name, svg(body, w, h))
for name, colour in [('skoor-logo-black.svg', BLACK), ('skoor-logo-white.svg', WHITE)]:
    body, w, h = wordmark(colour, None, colour)
    write(name, svg(body, w, h, f' color="{colour}"'))
write('skoor-icon.svg', icon(rounded=True))
write('skoor-icon-square.svg', icon(rounded=False))
write('skoor-icon-maskable.svg', icon(rounded=False, scale=0.75))
write('skoor-favicon.svg', favicon())
print('ok', OUT)
