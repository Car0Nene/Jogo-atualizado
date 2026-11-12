"""Recorta lutadores de folhas com FUNDO OPACO (ex.: Pedro e Daniel).

Para cada quadro listado em CUTS, recorta o retÃ¢ngulo da folha, remove o fundo com
IA (rembg, roda no seu computador) e guarda sÃ³ o maior pedaÃ§o (o personagem) em:

  art-source/cutouts/<lutador>/<animacao>_<n>.png

Depois rode tools/build_atlas.py, que monta o atlas a partir desses recortes.
SÃ³ Ã© preciso rodar este script quando chegar uma folha nova ou mudar um retÃ¢ngulo.

Uso:   pip install "rembg[cpu]" pillow numpy scipy
       python tools/cutout.py            (todos)
       python tools/cutout.py pedro      (sÃ³ um lutador)
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'art-source' / 'cutouts'
MODEL = 'isnet-general-use'  # testado: melhor que u2net/isnet-anime nestas folhas
PAD = 10

# RetÃ¢ngulos (x0, y0, x1, y1) de cada quadro na folha original. keep='all' mantÃ©m
# tambÃ©m pedaÃ§os soltos grandes (ex.: garrafa na mÃ£o); padrÃ£o = sÃ³ o maior pedaÃ§o.
CUTS = {
    'pedro': {
        'sheet': 'art-source/pedro-sheet.png',
        'anims': {
            'idle':   [(495, 55, 572, 250), (585, 55, 665, 250)],
            'walk':   [(670, 55, 740, 250), (742, 55, 815, 250), (815, 55, 890, 250), (898, 55, 975, 250)],
            'run':    [(1000, 55, 1100, 250), (1100, 55, 1205, 250), (1205, 55, 1305, 250)],
            'jump':   [(1345, 55, 1422, 245), (1420, 55, 1512, 245)],
            'crouch': [(15, 330, 110, 478), (118, 330, 215, 478)],
            'guard':  [(260, 295, 352, 478), (378, 295, 475, 478)],
            'light':  [(510, 295, 665, 478), (630, 295, 785, 478)],
            'medium': [(745, 295, 905, 478), (875, 295, 1010, 478)],
            'heavy':  [(1050, 295, 1210, 478), (1205, 295, 1385, 478), (1385, 295, 1515, 478)],
            'smoke':  [(15, 540, 170, 740), (180, 540, 340, 740), (350, 540, 480, 740)],
            'drink':  [(760, 535, 870, 742), (895, 535, 1030, 742), (1045, 535, 1190, 742)],
            'hulk':   [(1190, 535, 1405, 742)],
            'escape': [(660, 805, 745, 1005), (770, 805, 870, 1005), (890, 805, 990, 1005), (1030, 795, 1120, 1005)],
        },
        'keep': {'drink': 'all'},
    },
    'daniel': {
        'sheet': 'art-source/daniel-sheet.png',
        'anims': {
            'idle':   [(495, 45, 582, 225), (582, 45, 658, 225), (655, 45, 735, 225)],
            'walk':   [(735, 45, 815, 225), (815, 45, 895, 225), (895, 45, 985, 225)],
            'run':    [(980, 45, 1078, 225), (1073, 45, 1172, 225), (1168, 45, 1265, 225)],
            'jump':   [(1290, 45, 1375, 225), (1372, 40, 1445, 215), (1440, 40, 1525, 215)],
            'crouch': [(10, 315, 105, 435), (105, 315, 200, 435)],
            'guard':  [(235, 275, 330, 435), (330, 275, 430, 435)],
            'light':  [(465, 275, 565, 435), (580, 275, 690, 435)],
            'medium': [(685, 275, 805, 435), (790, 275, 915, 435), (900, 275, 1010, 435)],
            'heavy':  [(1080, 275, 1210, 435), (1205, 275, 1375, 435), (1390, 275, 1488, 435)],
            'dance':  [(8, 478, 152, 715), (148, 478, 282, 715), (278, 478, 398, 715), (393, 478, 503, 715), (498, 478, 612, 715)],
            'praia':  [(620, 485, 765, 715), (765, 485, 888, 715), (885, 485, 1025, 715), (1000, 485, 1145, 715), (1150, 485, 1290, 715)],
            'win':    [(5, 745, 158, 1005), (158, 745, 292, 1005), (292, 745, 430, 1005), (430, 745, 605, 1005)],
        },
        'keep': {},
    },
}

# Franciely e Gabi: retângulos estimados — confira com a prévia depois de rodar.
CUTS['franciely'] = {
    'sheet': 'art-source/franciely-sheet.png',
    'anims': {
        'idle':   [(555, 50, 665, 242)],
        'walk':   [(688, 50, 805, 242), (808, 50, 925, 242)],
        'run':    [(938, 50, 1052, 242), (1058, 50, 1202, 242)],
        'jump':   [(1212, 45, 1310, 238), (1310, 40, 1415, 238), (1405, 40, 1518, 238)],
        'crouch': [(12, 292, 126, 452), (124, 292, 246, 452)],
        'guard':  [(282, 280, 392, 452), (392, 280, 502, 452)],
        'light':  [(502, 280, 642, 452), (638, 280, 786, 452)],
        'medium': [(768, 280, 926, 452), (922, 280, 1038, 452)],
        'heavy':  [(1042, 280, 1206, 452), (1204, 280, 1368, 452), (1378, 280, 1512, 452)],
        'mama':   [(636, 492, 838, 748), (866, 528, 1138, 748)],
        'win':    [(12, 778, 252, 1012)],
    },
    'keep': {},
}
CUTS['gabi'] = {
    'sheet': 'art-source/gabi-sheet.png',
    'anims': {
        'idle':   [(498, 48, 592, 242), (588, 48, 692, 242)],
        'walk':   [(712, 48, 806, 242), (802, 48, 892, 242), (882, 48, 982, 242)],
        'run':    [(972, 48, 1066, 242), (1058, 48, 1176, 242), (1168, 48, 1292, 242)],
        'jump':   [(1288, 42, 1386, 222), (1376, 48, 1456, 222), (1442, 38, 1518, 222)],
        'crouch': [(8, 298, 126, 442), (128, 298, 252, 442)],
        'guard':  [(262, 278, 392, 442), (388, 278, 528, 442)],
        'light':  [(542, 278, 692, 442), (668, 278, 826, 442)],
        'medium': [(798, 278, 956, 442), (952, 278, 1072, 442)],
        'heavy':  [(1098, 272, 1256, 442), (1252, 272, 1396, 442), (1392, 272, 1532, 442)],
        'dance':  [(18, 482, 196, 738), (192, 482, 362, 738), (352, 482, 522, 738), (512, 482, 668, 738)],
    },
    'keep': {},
    'despill': True,  # fundo rosa dessa folha gruda nos recortes
}

# Retratos da tela de seleção/HUD: (folha, retângulo) → assets/portraits/<lutador>.png
PORTRAITS = {
    'pedro': ('art-source/pedro-sheet.png', (20, 17, 186, 228)),
    'daniel': ('art-source/daniel-sheet.png', (17, 14, 183, 218)),
    'franciely': ('art-source/franciely-sheet.png', (16, 16, 224, 236)),
    'gabi': ('art-source/gabi-sheet.png', (40, 12, 290, 245)),
}

# Objetos soltos (efeitos/itens). Salvos em cutouts/fx/<nome>.png
FX = {
    'heineken': ('art-source/pedro-sheet.png', (1410, 535, 1495, 742)),
    'coconut':  ('art-source/daniel-sheet.png', (1165, 795, 1270, 905)),
    'mic':      ('art-source/daniel-sheet.png', (1170, 900, 1265, 990)),
    'shades':   ('art-source/daniel-sheet.png', (1355, 790, 1475, 855)),
}


def despill(res):
    """Remove restos do fundo rosa/lilás que ficam grudados na borda do recorte.
    Só apaga regiões dessa cor CONECTADAS à parte transparente, então detalhes
    rosa por dentro do personagem (ex.: flores no jeans) são preservados."""
    rgb = res[:, :, :3].astype(np.float32) / 255
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    pinkish = (sat > 0.25) & (mx > 0.5) & (g < r * 0.85) & (g < b * 0.85)  # magenta/lilás
    alpha = res[:, :, 3] >= 128
    outside = ndimage.binary_dilation(~alpha, iterations=2)
    labels, n = ndimage.label(pinkish & alpha)
    if n:
        touching = np.unique(labels[outside & (labels > 0)])
        res[np.isin(labels, touching[touching > 0]), 3] = 0
    return res


def cut(session, sheet, rect, keep, clean=False):
    from rembg import remove
    x0, y0, x1, y1 = rect
    w, h = sheet.size
    box = (max(0, x0 - PAD), max(0, y0 - PAD), min(w, x1 + PAD), min(h, y1 + PAD))
    crop = sheet.crop(box)
    res = np.array(remove(crop, session=session, post_process_mask=True))
    if clean:
        res = despill(res)
    mask = res[:, :, 3] >= 128
    labels, n = ndimage.label(mask)
    if n == 0:
        raise RuntimeError(f'nada encontrado em {rect}')
    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    big = int(np.argmax(sizes)) + 1
    if keep == 'all':
        keep_ids = [i + 1 for i, s in enumerate(sizes) if s >= sizes.max() * 0.04]
        mask = np.isin(labels, keep_ids)
    else:
        mask = labels == big
    # fecha só furinhos (ruído); vãos grandes (entre braço e corpo) continuam transparentes
    holes = ndimage.binary_fill_holes(mask) & ~mask
    hole_labels, hole_count = ndimage.label(holes)
    if hole_count:
        hole_sizes = ndimage.sum(holes, hole_labels, range(1, hole_count + 1))
        small = [i + 1 for i, s in enumerate(hole_sizes) if s < 40]
        mask |= np.isin(hole_labels, small)
    res[:, :, 3] = np.where(mask, 255, 0)
    ys, xs = np.nonzero(mask)
    return Image.fromarray(res[ys.min():ys.max() + 1, xs.min():xs.max() + 1], 'RGBA')


def main():
    from rembg import new_session
    only = set(sys.argv[1:])
    session = new_session(MODEL)
    for char, spec in CUTS.items():
        if only and char not in only:
            continue
        if not (ROOT / spec['sheet']).exists():
            print(f'AVISO: {spec["sheet"]} não encontrado — pulando {char}.')
            continue
        portrait = PORTRAITS.get(char)
        if portrait:
            face = Image.open(ROOT / portrait[0]).convert('RGB').crop(portrait[1])
            face = face.resize((137, round(137 * face.height / face.width)), Image.LANCZOS)
            face.save(ROOT / 'assets' / 'portraits' / f'{char}.png', optimize=True)
        sheet = Image.open(ROOT / spec['sheet']).convert('RGB')
        folder = OUT / char
        folder.mkdir(parents=True, exist_ok=True)
        for anim, rects in spec['anims'].items():
            for i, rect in enumerate(rects):
                img = cut(session, sheet, rect, spec['keep'].get(anim), spec.get('despill', False))
                img.save(folder / f'{anim}_{i}.png', optimize=True)
                print(char, anim, i, img.size)
    if not only or 'fx' in only:
        (OUT / 'fx').mkdir(parents=True, exist_ok=True)
        for name, (sheet_path, rect) in FX.items():
            img = cut(session, Image.open(ROOT / sheet_path).convert('RGB'), rect, None)
            img.save(OUT / 'fx' / f'{name}.png', optimize=True)
            print('fx', name, img.size)


if __name__ == '__main__':
    main()
