"""Gera o atlas limpo de sprites do Família Fighter.

Lê as folhas originais (que têm fundo/brilho semi-transparente e escalas diferentes),
recorta cada quadro pelo componente conectado, remove o fundo, normaliza a escala e
calcula a âncora (ponto dos pés) de cada quadro. Saída:

  assets/sprites/fighters.png   atlas compacto com todos os quadros
  js/sprite-data.js     tabela de quadros: [x, y, w, h, ancoraX, ancoraY]
  assets/menu/menu.webp         arte do menu otimizada

Uso (na pasta do projeto):  python tools/build_atlas.py
Requer: pip install pillow numpy scipy
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = 'art-source/'
MAIN = SRC + 'sprite-sheet-principal.png'
COMBAT = SRC + 'combat-sprites.png'
SPECIALS = SRC + 'specials-reference.png'

# Escala de cada grupo para ficar igual à folha principal.
S_JUJU = 1.12      # Juraci na folha de especiais
S_FORMS = 0.85     # painel de transformações do Carlos
ROW5 = 1.28        # linha de dano/queda do Carlos na folha principal

# Cada quadro: (folha, limiar, [(x, y) do canto do componente principal, ...efeitos], escala, recorte_x)
# O (x, y) identifica o componente detectado (ver tools/analyze em README).
F = lambda sheet, comps, scale=1.0, thr=128, clip=None: dict(sheet=sheet, comps=comps, scale=scale, thr=thr, clip=clip)

# Lutadores de folhas com fundo opaco: usam os recortes feitos por tools/cutout.py.
# C(personagem, animação, [índices na ordem desejada], escala)
S_PEDRO = 0.71    # Pedro na folha dele tem ~184 px de altura → ~130 px como os demais
S_DANIEL = 0.77   # Daniel ~169 px → ~130 px (linha 1: parado/andar/correr/pular)
S_DANIEL_R2 = 0.82  # linha 2 (agachar/defesa/socos/chutes) foi desenhada menor
S_DANIEL_R3 = 0.59  # linha 3 (dança/Natal Praia) foi desenhada maior
S_DANIEL_R4 = 0.55  # linha 4 (vitória) maior ainda
S_PEDRO_DRINK = 0.63  # bloco do especial Heineken desenhado maior
S_PEDRO_SMOKE = 0.68
C = lambda char, anim, order, scale: [dict(cut=f'{SRC}cutouts/{char}/{anim}_{i}.png', scale=scale) for i in order]


def auto_scale(char, mult=1.0, target=130):
    """Escala para o quadro 'parado' ficar com ~130 px (igual aos demais). mult corrige
    linhas da folha desenhadas em outro tamanho. Retorna None se o recorte não existe."""
    path = ROOT / SRC / 'cutouts' / char / 'idle_0.png'
    if not path.exists():
        return None
    return target / Image.open(path).height * mult

FRAMES = {
    'juraci': {
        'idle':   [F(MAIN, [(231, 60)]), F(MAIN, [(325, 60)]), F(MAIN, [(407, 60)]), F(MAIN, [(494, 58)])],
        'walk':   [F(MAIN, [(570, 57)]), F(MAIN, [(651, 57)]), F(MAIN, [(736, 56)]), F(MAIN, [(807, 58)])],
        'run':    [F(MAIN, [(898, 61)]), F(MAIN, [(983, 60)]), F(MAIN, [(1088, 55)])],
        'jump':   [F(MAIN, [(1226, 76)]), F(MAIN, [(1309, 70)]), F(MAIN, [(1376, 51)]), F(MAIN, [(1446, 55)])],
        'crouch': [F(MAIN, [(16, 261)]), F(MAIN, [(99, 273)]), F(MAIN, [(173, 270)])],
        'guard':  [F(MAIN, [(249, 244)], clip=(0, 328)), F(MAIN, [(249, 244)], clip=(328, 9999))],
        'light':  [F(MAIN, [(417, 250)]), F(MAIN, [(512, 253)])],
        'medium': [F(MAIN, [(641, 245)]), F(MAIN, [(744, 252), (863, 249)])],
        'heavy':  [F(MAIN, [(897, 252)]), F(MAIN, [(992, 256), (1099, 236)])],
        'special': [F(COMBAT, [(16, 173)]), F(COMBAT, [(178, 174)]), F(COMBAT, [(332, 168)])],
        'knockdown': [F(SPECIALS, [(392, 255)], S_JUJU), F(SPECIALS, [(509, 254)], S_JUJU), F(SPECIALS, [(619, 247)], S_JUJU)],
    },
    'carlos': {
        'idle':   [F(MAIN, [(284, 427)]), F(MAIN, [(387, 427)]), F(MAIN, [(479, 427)])],
        'walk':   [F(MAIN, [(595, 426)]), F(MAIN, [(684, 427)]), F(MAIN, [(775, 428)])],
        'run':    [F(MAIN, [(881, 427)]), F(MAIN, [(997, 425)]), F(MAIN, [(1089, 426)])],
        'jump':   [F(MAIN, [(1233, 426)]), F(MAIN, [(1327, 426)]), F(MAIN, [(1419, 429)])],
        'crouch': [F(MAIN, [(13, 621)]), F(MAIN, [(91, 622)]), F(MAIN, [(170, 627)])],
        'guard':  [F(MAIN, [(250, 608)]), F(MAIN, [(340, 610)])],
        'light':  [F(MAIN, [(506, 616)]), F(MAIN, [(570, 617)])],
        'medium': [F(MAIN, [(658, 614)]), F(MAIN, [(746, 612), (864, 628)])],
        'heavy':  [F(MAIN, [(913, 616), (1001, 621)]), F(MAIN, [(1064, 612)])],
        'special': [F(MAIN, [(1196, 625)]), F(MAIN, [(1301, 610)]), F(MAIN, [(1377, 608)])],
        'hurt':   [F(MAIN, [(905, 801)], ROW5), F(MAIN, [(990, 794)], ROW5), F(MAIN, [(1074, 794)], ROW5)],
        'knockdown': [F(MAIN, [(358, 810)], ROW5), F(MAIN, [(459, 812)], ROW5), F(MAIN, [(542, 844)], ROW5)],
        'getup':  [F(MAIN, [(743, 799)], ROW5), F(MAIN, [(819, 803)], ROW5)],
        'gordao': [F(SPECIALS, [(18, 589)], S_FORMS, 250), F(SPECIALS, [(121, 601)], S_FORMS, 250),
                   F(SPECIALS, [(231, 580)], S_FORMS, 250, (0, 376)), F(SPECIALS, [(231, 580)], S_FORMS, 250, (376, 9999))],
        'crente': [F(SPECIALS, [(599, 662)], S_FORMS, 250), F(SPECIALS, [(707, 611)], S_FORMS, 250, (0, 836)),
                   F(SPECIALS, [(707, 611)], S_FORMS, 250, (836, 9999)), F(SPECIALS, [(1018, 576)], S_FORMS, 250)],
    },
    'pedro': {
        'idle':   C('pedro', 'idle', [0, 1], S_PEDRO),
        'walk':   C('pedro', 'walk', [0, 1, 2, 3], S_PEDRO),
        'run':    C('pedro', 'run', [0, 1, 2], S_PEDRO),
        'jump':   C('pedro', 'jump', [0, 1], S_PEDRO),
        'crouch': C('pedro', 'crouch', [0, 1], S_PEDRO),
        'guard':  C('pedro', 'guard', [0, 1], S_PEDRO),
        'light':  C('pedro', 'light', [1, 0], S_PEDRO),     # recolhido → braço esticado
        'medium': C('pedro', 'medium', [0, 1], S_PEDRO),
        'heavy':  C('pedro', 'heavy', [2, 0, 1], S_PEDRO),  # base → chute → chute alto
        'smoke':  C('pedro', 'smoke', [0, 1, 2], S_PEDRO_SMOKE),
        'drink':  C('pedro', 'drink', [0, 1, 2], S_PEDRO_DRINK),
        'hulk':   C('pedro', 'hulk', [0], S_PEDRO_DRINK * 1.08),
        'escape': C('pedro', 'escape', [0, 1, 2, 3], S_PEDRO),
    },
    'daniel': {
        'idle':   C('daniel', 'idle', [0, 1, 2], S_DANIEL),
        'walk':   C('daniel', 'walk', [0, 1, 2], S_DANIEL),
        'run':    C('daniel', 'run', [0, 1, 2], S_DANIEL),
        'jump':   C('daniel', 'jump', [0, 1, 2], S_DANIEL),
        'crouch': C('daniel', 'crouch', [0, 1], S_DANIEL_R2),
        'guard':  C('daniel', 'guard', [0, 1], S_DANIEL_R2),
        'light':  C('daniel', 'light', [0, 1], S_DANIEL_R2),
        'medium': C('daniel', 'medium', [0, 1], S_DANIEL_R2),
        'heavy':  C('daniel', 'heavy', [2, 0, 1], S_DANIEL_R2),
        'dance':  C('daniel', 'dance', [0, 1, 2, 3, 4], S_DANIEL_R3),
        'praia':  C('daniel', 'praia', [0, 1, 2, 3, 4], S_DANIEL_R3),
        'win':    C('daniel', 'win', [0, 1, 2, 3], S_DANIEL_R4),
    },
}

# Franciely e Gabi entram automaticamente quando os recortes existirem (tools/cutout.py).
# Se alguma linha ficar maior/menor que as outras, ajuste o multiplicador (2º número).
_F = auto_scale('franciely')
if _F:
    FRAMES['franciely'] = {
        'idle':   C('franciely', 'idle', [0], _F),
        'walk':   C('franciely', 'walk', [0, 1], _F),
        'run':    C('franciely', 'run', [0, 1], _F),
        'jump':   C('franciely', 'jump', [0, 1, 2], _F),
        'crouch': C('franciely', 'crouch', [0, 1], _F * 1.15),
        'guard':  C('franciely', 'guard', [0, 1], _F * 1.15),
        'light':  C('franciely', 'light', [0, 1], _F * 1.15),
        'medium': C('franciely', 'medium', [0, 1], _F * 1.15),
        'heavy':  C('franciely', 'heavy', [2, 0, 1], _F * 1.15),
        'mama':   C('franciely', 'mama', [1, 1], _F * 0.85),  # só a pose do jato de leite
        'win':    C('franciely', 'win', [0], _F * 0.75),
    }
_G = auto_scale('gabi')
if _G:
    FRAMES['gabi'] = {
        'idle':   C('gabi', 'idle', [0, 1], _G),
        'walk':   C('gabi', 'walk', [0, 1, 2], _G),
        'run':    C('gabi', 'run', [0, 1, 2], _G),
        'jump':   C('gabi', 'jump', [0, 1, 2], _G),
        'crouch': C('gabi', 'crouch', [0, 1], _G * 1.15),
        'guard':  C('gabi', 'guard', [0, 1], _G * 1.15),
        'light':  C('gabi', 'light', [0, 1], _G * 1.15),
        'medium': C('gabi', 'medium', [0, 1], _G * 1.15),
        'heavy':  C('gabi', 'heavy', [0, 1, 2], _G * 1.15),
        'dance':  C('gabi', 'dance', [0, 1, 2, 3], _G * 0.72),
    }

# Efeitos: componente (sheet, comps) ou recorte com chroma-key do painel roxo (rect).
FX = {
    'cake':   F(SPECIALS, [(478, 158)], 1.0),
    'cakeHit': F(SPECIALS, [(671, 149)], 1.0),
    'burst':  dict(sheet=MAIN, rect=(497, 902, 118, 108), scale=0.8),
    'arc':    dict(sheet=MAIN, rect=(343, 902, 160, 108), scale=0.8),
    'dust':   dict(sheet=MAIN, rect=(925, 902, 170, 108), scale=0.7),
    'star':   dict(sheet=MAIN, rect=(1268, 905, 64, 100), scale=0.6),
    'heart':  dict(sheet=MAIN, rect=(1200, 935, 60, 70), scale=0.6),
    'heineken': dict(cut=f'{SRC}cutouts/fx/heineken.png', scale=0.32, center=True),
    'coconut':  dict(cut=f'{SRC}cutouts/fx/coconut.png', scale=0.45, center=True),
    'mic':      dict(cut=f'{SRC}cutouts/fx/mic.png', scale=0.45, center=True),
    'shades':   dict(cut=f'{SRC}cutouts/fx/shades.png', scale=0.4, center=True),
}

_cache = {}


def load(sheet, thr):
    key = (sheet, thr)
    if key not in _cache:
        rgba = np.array(Image.open(ROOT / sheet).convert('RGBA'))
        mask = ndimage.binary_closing(rgba[:, :, 3] >= thr, iterations=2)
        labels, _ = ndimage.label(mask)
        objs = ndimage.find_objects(labels)
        index = {(s[1].start, s[0].start): i + 1 for i, s in enumerate(objs) if s is not None}
        _cache[key] = (rgba, labels, objs, index)
    return _cache[key]


def find_label(index, x, y):
    if (x, y) in index:
        return index[(x, y)]
    best = min(index, key=lambda k: abs(k[0] - x) + abs(k[1] - y))
    if abs(best[0] - x) + abs(best[1] - y) > 4:
        raise KeyError(f'componente {x},{y} não encontrado (mais próximo {best})')
    return index[best]


def extract(spec):
    rgba, labels, objs, index = load(spec['sheet'], spec['thr'])
    ids = [find_label(index, x, y) for x, y in spec['comps']]
    mask = np.isin(labels, ids)
    main = labels == ids[0]
    if spec['clip']:
        x0, x1 = spec['clip']
        cols = np.zeros(mask.shape[1], bool)
        cols[x0:x1] = True
        mask &= cols[None, :]
        main &= cols[None, :]
        # o recorte pode separar pedaços do vizinho: mantém só o maior pedaço principal
        lab2, n = ndimage.label(main)
        if n > 1:
            sizes = ndimage.sum(main, lab2, range(1, n + 1))
            main = lab2 == (int(np.argmax(sizes)) + 1)
            mask = main | (mask & ~np.isin(labels, ids[:1]))
    alpha_ok = rgba[:, :, 3] >= spec['thr']
    mask &= alpha_ok | main  # mantém preenchimento interno do principal
    ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    crop = rgba[y0:y1, x0:x1].copy()
    crop[:, :, 3] = np.where(mask[y0:y1, x0:x1], 255, 0)
    # âncora: pés = base do corpo; x = mediana da massa do corpo (estável entre quadros)
    my, mx = np.nonzero(main[y0:y1, x0:x1])
    foot_y = my.max() + 1
    lower = mx[my > foot_y - (foot_y - my.min()) * 0.55]
    anchor_x = float(np.median(mx)) * 0.5 + float(np.median(lower)) * 0.5
    return finish(crop, anchor_x, foot_y, spec['scale'])


def extract_cut(spec):
    """Recorte pronto (tools/cutout.py): só calcula a âncora dos pés e escala."""
    arr = np.array(Image.open(ROOT / spec['cut']).convert('RGBA'))
    arr[:, :, 3] = np.where(arr[:, :, 3] >= 128, 255, 0)
    if spec.get('center'):
        return finish(arr, arr.shape[1] / 2, arr.shape[0] / 2, spec['scale'])
    my, mx = np.nonzero(arr[:, :, 3])
    foot_y = my.max() + 1
    lower = mx[my > foot_y - (foot_y - my.min()) * 0.55]
    anchor_x = float(np.median(mx)) * 0.5 + float(np.median(lower)) * 0.5
    return finish(arr, anchor_x, foot_y, spec['scale'])


def extract_any(spec):
    if 'cut' in spec:
        return extract_cut(spec)
    if 'comps' in spec:
        return extract(spec)
    return extract_key(spec)


def extract_key(spec):
    rgba = np.array(Image.open(ROOT / spec['sheet']).convert('RGBA'))
    x, y, w, h = spec['rect']
    crop = rgba[y:y + h, x:x + w].astype(np.int32)
    bg = np.array([50, 10, 100])
    dist = np.sqrt(((crop[:, :, :3] - bg) ** 2).sum(axis=2))
    alpha = np.clip((dist - 45) * 255 / 50, 0, 255)
    out = crop.astype(np.uint8)
    out[:, :, 3] = alpha.astype(np.uint8)
    ys, xs = np.nonzero(alpha > 0)
    out = out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return finish(out, out.shape[1] / 2, out.shape[0] / 2, spec['scale'])


# Resolução do atlas em relação ao tamanho "de jogo" dos quadros. Maior = mais nítido quando
# a câmera aproxima. O jogo divide por FF_SPRITE_SCALE na hora de desenhar.
ATLAS_SCALE = 1.4


def finish(arr, ax, ay, scale):
    scale *= ATLAS_SCALE
    binary_alpha = np.isin(arr[:, :, 3], (0, 255)).all()
    img = Image.fromarray(arr, 'RGBA')
    if scale != 1:
        img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
        if binary_alpha:  # mantém borda nítida, sem halo
            a = np.array(img)
            a[:, :, 3] = np.where(a[:, :, 3] >= 110, 255, 0)
            img = Image.fromarray(a, 'RGBA')
    return img, ax * scale, ay * scale


def pack(images, width=2048, pad=4):
    x = y = shelf = 0
    places = []
    for img in images:
        if x + img.width + pad > width:
            x, y, shelf = 0, y + shelf + pad, 0
        places.append((x, y))
        x += img.width + pad
        shelf = max(shelf, img.height)
    return places, y + shelf


def main():
    items = []  # (char, anim, index, img, ax, ay)
    for char, anims in FRAMES.items():
        for anim, frames in anims.items():
            for i, spec in enumerate(frames):
                img, ax, ay = extract_any(spec)
                items.append((char, anim, i, img, ax, ay))
    for name, spec in FX.items():
        img, ax, ay = extract_any(spec)
        items.append(('fx', name, 0, img, ax, ay))

    order = sorted(range(len(items)), key=lambda i: -items[i][3].height)
    places, height = pack([items[i][3] for i in order])
    atlas = Image.new('RGBA', (2048, height), (0, 0, 0, 0))
    data = {}
    for slot, i in enumerate(order):
        char, anim, idx, img, ax, ay = items[i]
        px, py = places[slot]
        atlas.paste(img, (px, py))
        data.setdefault(char, {}).setdefault(anim, [None] * 8)
        data[char][anim][idx] = [px, py, img.width, img.height, round(ax, 1), round(ay, 1)]
    for char in data.values():
        for anim in char:
            char[anim] = [f for f in char[anim] if f is not None]

    (ROOT / 'assets' / 'sprites').mkdir(parents=True, exist_ok=True)
    (ROOT / 'assets' / 'menu').mkdir(parents=True, exist_ok=True)
    (ROOT / 'js').mkdir(exist_ok=True)
    # WebP (qualidade alta, cores reais) é o principal; PNG de 256 cores é reserva p/ navegadores antigos.
    webp_path = ROOT / 'assets' / 'sprites' / 'fighters.webp'
    atlas.save(webp_path, quality=85, method=6, alpha_quality=90)
    atlas.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(
        ROOT / 'assets' / 'sprites' / 'fighters.png', optimize=True)
    data_json = json.dumps(data, separators=(',', ':'))
    # versão = impressão digital do conteúdo: o jogo pede fighters.webp?v=... e o cache
    # nunca mistura a imagem antiga com a tabela nova (causa de sprites "quebrados").
    import hashlib
    version = hashlib.sha1(webp_path.read_bytes() + data_json.encode()).hexdigest()[:10]
    js = '// Gerado por tools/build_atlas.py — não edite à mão.\n'
    js += '// Cada quadro: [x, y, largura, altura, ancoraX, ancoraY(pés)] em pixels do atlas.\n'
    js += f'window.FF_SPRITE_SCALE = {ATLAS_SCALE};\n'
    js += f'window.FF_SPRITE_VERSION = "{version}";\n'
    js += 'window.FF_SPRITES = ' + data_json + ';\n'
    (ROOT / 'js' / 'sprite-data.js').write_text(js, encoding='utf-8')

    menu = Image.open(ROOT / 'assets' / 'menu' / 'menu.png').convert('RGB')
    menu.save(ROOT / 'assets' / 'menu' / 'menu.webp', quality=84, method=6)
    print('atlas', atlas.size, 'frames', len(items))


if __name__ == '__main__':
    main()
