#!/usr/bin/env python3
"""Gera public/wobbler/qr.js com os QR dos wobblers de balcão (sem serviço externo).
Uso: pip install segno && python3 scripts/wobbler-qr.py
Ao trocar um link (ex.: perfil do Grão-Pará no Google), edite QR_URLS e rode de novo."""
import json, pathlib, segno

HOME = 'https://institutofacaamigos.com.br'
QR_URLS = {
    'parque': 'https://g.page/r/CdAKkR4NdeqlEAE/review',          # verificar: perfil do Playground Parque
    'graopara': 'https://g.page/r/PREENCHER-GRAO-PARA/review',     # PROVISÓRIO: falta o link do perfil
    'clinica': 'https://g.page/r/CUpdqF5yECeVECE/review',          # informado pela clínica
    'fidelidade': f'{HOME}/circuito?utm_source=wobbler&utm_medium=balcao',
    'inclusivo': f'{HOME}/clinica?utm_source=wobbler&utm_medium=balcao',
    'instagram': 'https://www.instagram.com/facaamigos.belem/',
}
out = {}
for k, url in QR_URLS.items():
    m = segno.make(url, error='m', micro=False)
    n = len(m.matrix)
    d = ''.join(f'M{x} {y}h1v1h-1z' for y, row in enumerate(m.matrix) for x, v in enumerate(row) if v)
    out[k] = {'url': url, 'n': n, 'd': d}
pathlib.Path(__file__).resolve().parent.parent.joinpath('public/wobbler/qr.js').write_text(
    '// gerado por scripts/wobbler-qr.py — não editar à mão\nconst QR = ' + json.dumps(out, ensure_ascii=False) + ';\n')
print({k: (v['n'], v['url']) for k, v in out.items()})
