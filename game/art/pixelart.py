"""Coin Hopper pixel art: palette, sprite maps and PNG export.

Every sprite is a grid of palette keys, one character per pixel, drawn at native size
(tiles 16x16, characters about 12x16) and shown in the game at 2x. Run:

    python3 pixelart.py            # writes PNGs into ../assets/ at native size
    python3 pixelart.py board OUT  # writes a style board PNG to OUT
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------------------
# Palette. Each material gets at most three tones (light, base, shadow) plus the shared
# outline. Light comes from the top-left: highlights on top and left edges, shadow on the
# bottom and right. No anti-aliasing, gradients or blended in-between colours.
# ---------------------------------------------------------------------------
PALETTE = {
    '.': None,                       # transparent
    'o': ('#1b1f3b', 'outline'),     # deep navy outline, used for every sprite edge and pupils
    'W': ('#ffffff', 'eye white'),
    # hero: blue suit
    'L': ('#6fa3e8', 'hero light'),
    'B': ('#3f6fc1', 'hero base'),
    'b': ('#2d4b8e', 'hero shadow'),
    # hero accent: scarf
    'R': ('#f2703f', 'accent base'),
    'r': ('#c2412d', 'accent shadow'),
    # grass
    'H': ('#8fd95b', 'grass light'),
    'G': ('#4caa48', 'grass base'),
    'g': ('#2f7a3a', 'grass shadow'),
    # dirt
    'l': ('#b07a4a', 'dirt light'),
    'D': ('#8a5a36', 'dirt base'),
    'd': ('#5a3825', 'dirt shadow'),
}

SKY = '#7ec8f0'  # game background the art must read against

# ---------------------------------------------------------------------------
# Sprites
# ---------------------------------------------------------------------------
SPRITES = {
    # Hero, facing right. 12x16, one-pixel outline, round hood, one big eye, orange scarf.
    'player': [
        '....oooooo..',
        '...oLLLLBBo.',
        '..oLLBBBBBBo',
        '..oLBBBBWWWo',
        '..oLBBBBWoWo',
        '..oBBBBBWoWo',
        '.ooRRRRRRRRo',
        'oRRrrrrrrrro',
        'oroLBBBBBBbo',
        '.ooBBBBBBbbo',
        '..oLBBBBBbbo',
        '..obBBBBbbbo',
        '...obbbbbbo.',
        '...oBo..oBo.',
        '...obo..obo.',
        '...ooo..ooo.',
    ],
    # Ground surface tile: grass on top, dirt below. Tiles horizontally.
    'grass': [
        'HHHHHHHHHHHHHHHH',
        'GHGGGHGGGGGHGGGH',
        'GGGGGGGGGGGGGGGG',
        'GGgGGGGGGgGGGGgG',
        'gGgggGGggggGGggg',
        'dgDdggdDDdggdDgd',
        'DdDDdgDDDDdgDDDD',
        'DDDDDdDDlDDdDDDD',
        'DDlDDDDDDDDDDDdD',
        'DDDDDDdDDDDlDDDD',
        'DdDDDDDDDDDDDDDD',
        'DDDDlDDDDdDDDDlD',
        'DDDDDDDDDDDDDDDD',
        'DDdDDDDlDDDDdDDD',
        'DDDDDDDDDDDDDDDD',
        'dDDDDdDDDDDDDDDd',
    ],
    # Dirt fill tile for everything below the surface. Tiles in both directions.
    'dirt': [
        'DDDDDDDDDDDDDDDD',
        'DDdDDDDDDlDDDDDD',
        'DDDDDDDDDDDDDdDD',
        'DDDDDlDDDDDDDDDD',
        'DDDDDDDDDdDDDDDD',
        'dDDDDDDDDDDDDDlD',
        'DDDDDDdDDDDDDDDD',
        'DDlDDDDDDDDDDDDD',
        'DDDDDDDDDDDlDDDD',
        'DDDDdDDDDDDDDDDD',
        'DDDDDDDDlDDDDdDD',
        'DDDDDDDDDDDDDDDD',
        'DdDDDDDDDDDDDDDD',
        'DDDDDDDdDDDDlDDD',
        'DDDDlDDDDDDDDDDD',
        'DDDDDDDDDDDdDDDD',
    ],
}


def rgba(key):
    entry = PALETTE[key]
    if entry is None:
        return (0, 0, 0, 0)
    h = entry[0].lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def sprite_image(name, scale=1):
    rows = SPRITES[name]
    w = len(rows[0])
    assert all(len(r) == w for r in rows), f'{name}: rows have different widths'
    img = Image.new('RGBA', (w, len(rows)), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            img.putpixel((x, y), rgba(ch))
    if scale != 1:
        img = img.resize((w * scale, len(rows) * scale), Image.NEAREST)
    return img


def export(out_dir):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for name in SPRITES:
        sprite_image(name).save(out / f'{name}.png')
        print('wrote', out / f'{name}.png')


def font(size, bold=False):
    path = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def style_board(out_path):
    """One image with the palette, the hero and the ground tiles zoomed, and an in-game-scale scene."""
    W, H = 1200, 760
    bg = (22, 28, 43, 255)
    board = Image.new('RGBA', (W, H), bg)
    d = ImageDraw.Draw(board)
    fg, muted = (238, 241, 248), (167, 176, 199)

    d.text((40, 28), 'Coin Hopper  ·  pixel-art style target', font=font(30, True), fill=fg)
    d.text((40, 70), 'Native 16 px grid, shown 2x in game  ·  1 px navy outline on sprites  ·  light from top-left  ·  max 3 tones per material',
           font=font(16), fill=muted)

    # Palette swatches with roles.
    x, y = 40, 115
    d.text((x, y), 'PALETTE', font=font(15, True), fill=muted)
    y += 28
    keys = [k for k, v in PALETTE.items() if v]
    for i, k in enumerate(keys):
        cx = x + (i % 7) * 160
        cy = y + (i // 7) * 46
        d.rectangle([cx, cy, cx + 34, cy + 34], fill=rgba(k), outline=(70, 80, 110))
        d.text((cx + 44, cy + 2), PALETTE[k][1], font=font(14), fill=fg)
        d.text((cx + 44, cy + 19), PALETTE[k][0], font=font(12), fill=muted)

    # Zoomed sprites.
    y0 = 260
    d.text((40, y0), 'HERO 12×16', font=font(15, True), fill=muted)
    board.alpha_composite(Image.new('RGBA', (120, 160), SKY), (40, y0 + 28))
    board.alpha_composite(sprite_image('player', 10), (40, y0 + 28))

    d.text((220, y0), 'GRASS 16×16', font=font(15, True), fill=muted)
    board.alpha_composite(sprite_image('grass', 10), (220, y0 + 28))
    d.text((420, y0), 'DIRT 16×16', font=font(15, True), fill=muted)
    board.alpha_composite(sprite_image('dirt', 10), (420, y0 + 28))

    d.text((40, y0 + 200), 'zoomed ×10', font=font(13), fill=muted)

    # In-game scale scene: sky, a 3-tile-high ground strip, hero standing on it, all at 2x.
    sx, sy, sw, sh = 640, y0 + 28, 520, 300
    d.text((sx, y0), 'IN GAME  (2×, actual size)', font=font(15, True), fill=muted)
    scene = Image.new('RGBA', (sw, sh), SKY)
    tile = 32
    ground_top = sh - tile * 3
    for tx in range(0, sw, tile):
        scene.alpha_composite(sprite_image('grass', 2), (tx, ground_top))
        scene.alpha_composite(sprite_image('dirt', 2), (tx, ground_top + tile))
        scene.alpha_composite(sprite_image('dirt', 2), (tx, ground_top + tile * 2))
    # a raised step to show how tiles meet
    for tx in range(320, 320 + tile * 3, tile):
        scene.alpha_composite(sprite_image('grass', 2), (tx, ground_top - tile))
        scene.alpha_composite(sprite_image('dirt', 2), (tx, ground_top))
    scene.alpha_composite(sprite_image('player', 2), (120, ground_top - 32))
    board.alpha_composite(scene, (sx, sy))

    d.text((40, 640), 'Do: hard pixel clusters, one outline colour, highlights top-left, readable silhouette on the sky.',
           font=font(15), fill=fg)
    d.text((40, 666), "Don't: blended edge pixels, black outlines, gradients, colours outside the palette, detail finer than 1 px.",
           font=font(15), fill=fg)
    board.save(out_path)
    print('wrote', out_path)


def checker(w, h, cell=10):
    img = Image.new('RGBA', (w, h))
    d = ImageDraw.Draw(img)
    for yy in range(0, h, cell):
        for xx in range(0, w, cell):
            c = (52, 62, 90) if (xx // cell + yy // cell) % 2 else (42, 50, 74)
            d.rectangle([xx, yy, xx + cell - 1, yy + cell - 1], fill=c)
    return img


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'board':
        style_board(sys.argv[2])
    else:
        export(Path(__file__).resolve().parent.parent / 'assets')
