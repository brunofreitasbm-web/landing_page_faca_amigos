#!/usr/bin/env python3
"""Gera public/wobbler/forma.js a partir do contorno do wobbler original (em mm).

Entrada: scripts/wobbler-contorno-mm.json (pontos do contorno do original, círculo da base = Ø200 mm,
extraídos da foto por segmentação). Saída: curvas SVG do formato, da linha de corte (+2 mm, o adesivo
dobra na espessura do papelão) e da sangria (+3 mm além do corte), mais a área segura (-6 mm).
Uso: python3 scripts/wobbler-forma.py
"""
import json, pathlib
import cv2, numpy as np

ROOT = pathlib.Path(__file__).resolve().parent
P = np.array(json.loads((ROOT / 'wobbler-contorno-mm.json').read_text()))
PX = 10                      # 10 px por mm no raster
CUT_MM, BLEED_MM, SAFE_MM = 2.0, 3.0, 6.0

def smooth(pts, sigma):
    n = len(pts); k = int(sigma * 4)
    g = np.exp(-0.5 * (np.arange(-k, k + 1) / sigma) ** 2); g /= g.sum()
    pad = np.vstack([pts[-k:], pts, pts[:k]])
    return np.c_[np.convolve(pad[:, 0], g, 'valid'), np.convolve(pad[:, 1], g, 'valid')]

P = smooth(P, 5)
ox, oy = P[:, 0].min() - 20, P[:, 1].min() - 20
W = int((P[:, 0].max() - ox + 20) * PX); H = int((P[:, 1].max() - oy + 20) * PX)

def mask_of(pts):
    m = np.zeros((H, W), np.uint8)
    q = ((pts - [ox, oy]) * PX).astype(np.int32)
    cv2.fillPoly(m, [q], 255)
    return m

def offset(m, mm):
    r = int(round(abs(mm) * PX)); k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    return cv2.dilate(m, k) if mm > 0 else cv2.erode(m, k)

def path_of(m, eps=0.6):
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cs, key=cv2.contourArea)
    c = cv2.approxPolyDP(c, eps, True)[:, 0, :].astype(float) / PX + [ox, oy]
    return 'M' + ' L'.join(f'{x:.2f} {y:.2f}' for x, y in c) + ' Z', c

base = mask_of(P)
shape, _ = path_of(base)
cut, cc = path_of(offset(base, CUT_MM))
bleed, bc = path_of(offset(base, CUT_MM + BLEED_MM))
safe, _ = path_of(offset(base, -SAFE_MM))
out = {
    'SHAPE': shape, 'CUT': cut, 'BLEED': bleed, 'SAFE': safe,
    'bbox': {k: round(float(v), 2) for k, v in zip(('x0', 'y0', 'x1', 'y1'), (bc[:, 0].min(), bc[:, 1].min(), bc[:, 0].max(), bc[:, 1].max()))},
    'orig': {k: round(float(v), 2) for k, v in zip(('x0', 'y0', 'x1', 'y1'), (P[:, 0].min(), P[:, 1].min(), P[:, 0].max(), P[:, 1].max()))},
}
(ROOT.parent / 'public/wobbler/forma.js').write_text('// gerado por scripts/wobbler-forma.py — não editar à mão\nconst FORMA = ' + json.dumps(out) + ';\n')
print(out['bbox'], out['orig'], len(shape), len(cut))
