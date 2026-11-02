#!/usr/bin/env python3
"""Embute conteudo/tv3-slides.json no tv3.html (bloco entre // POOL:BEGIN e // POOL:END).

A copy dos slides mora em conteudo/tv3-slides.json (e conteudo/tv3-roteiro-slides.md, que é a
versão legível para revisão). Este script valida o JSON e grava no HTML, igual ao scripts/tv3-qr.py.

Uso:
  python3 scripts/tv3-pool.py                 # valida e regrava o bloco
  python3 scripts/tv3-pool.py --check         # falha se o tv3.html não bate com o JSON (ou se o JSON é inválido)
  python3 scripts/tv3-pool.py --json caminho  # outro JSON (testes)
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML = ROOT / 'public' / 'tv3.html'
BEGIN, END = '// POOL:BEGIN', '// POOL:END'

FAMILIAS = set('ABCDEFGHIJKR')
LAYOUTS = {'padrao', 'tutorial', 'respiro'}
REQUIRES = {'wifiSsid', 'fotoGraoPara', 'portalAtivo'}
LIMITES = {
    'headline': 58, 'subtext': 165, 'kicker': 34, 'actionTitle': 34, 'actionDesc': 105,
    'qrTitle': 30, 'qrDesc': 88, 'qrHint': 38, 'highlightText': 88, 'quote': 88, 'badge': 30,
}
PROIBIDAS = re.compile(r'promessa|confian[çc]a|oferta|garantid|garantia|\bcura\b|crian[çc]a (normal|especial|problem)|!|—|IASEP|PROASA|conv[êe]nio|Mural da Fam', re.I)
TAG = re.compile(r'<[^>]+>')


def plano(txt):
    return TAG.sub('', txt)


def textos(slide):
    """Todas as strings visíveis do slide, com o campo de origem."""
    for k, v in slide.items():
        if k in ('id', 'fam', 'layout', 'qr', 'image', 'images', 'requires', 'tag', 'unit', 'kickerClass', 'imageFit'):
            continue
        if isinstance(v, str):
            yield k, v
        elif k == 'steps':
            for st in v:
                yield 'steps.title', st['title']
                yield 'steps.desc', st['desc']
        elif k == 'comparativo':
            for lado in ('left', 'right'):
                yield f'comparativo.{lado}.header', v[lado]['header']
                for it in v[lado]['items']:
                    yield f'comparativo.{lado}.item', it


def validar(slides, chaves_qr):
    erros = []
    ids = [s.get('id') for s in slides]
    if len(ids) != len(set(ids)):
        erros.append('ids repetidos')
    if sum(1 for s in slides if s.get('tag') == 'abertura') != 1:
        erros.append('precisa de exatamente 1 slide com tag "abertura"')
    if sum(1 for s in slides if s.get('tag') == 'fechamento') != 1:
        erros.append('precisa de exatamente 1 slide com tag "fechamento"')
    for s in slides:
        i = s.get('id', '?')
        e = lambda m: erros.append(f'{i}: {m}')
        if s.get('fam') not in FAMILIAS: e('fam inválida')
        if s.get('layout', 'padrao') not in LAYOUTS: e('layout inválido')
        if not isinstance(s.get('dur'), int) or not 5 <= s['dur'] <= 40: e('dur deve ser inteiro entre 5 e 40')
        if s.get('qr') is not None and s['qr'] not in chaves_qr: e(f'qr "{s.get("qr")}" não existe em scripts/tv3-qr.py')
        if s.get('requires') and s['requires'] not in REQUIRES: e('requires inválido')
        if s.get('imageFit') not in (None, 'retrato'): e('imageFit inválido')
        if s.get('dia') and not all(isinstance(d, int) and 1 <= d <= 5 for d in s['dia']): e('dia inválido')
        lay = s.get('layout', 'padrao')
        if lay == 'respiro':
            if not s.get('quote'): e('respiro sem quote')
        else:
            if not s.get('headline'): e('sem headline')
            if lay == 'tutorial' and len(s.get('steps', [])) != 3: e('tutorial precisa de 3 steps')
        if s.get('qr') and not s.get('qrTitle') and lay != 'padrao': e('QR sem qrTitle')
        img = s.get('image')
        if not img and lay != 'respiro' or (lay == 'respiro' and not img): e('sem image')
        for arq in ([img] if img else []) + s.get('images', []):
            if s.get('requires') == 'fotoGraoPara': continue
            if not (ROOT / 'public' / arq).exists(): e(f'imagem inexistente: {arq}')
        for campo, txt in textos(s):
            base = campo.split('.')[0]
            lim = LIMITES.get(base)
            if base == 'steps': lim = 28 if campo.endswith('title') else 62
            if base == 'comparativo': lim = 28 if campo.endswith('header') else 44
            if lim and len(plano(txt)) > lim: e(f'{campo} com {len(plano(txt))} caracteres (limite {lim})')
            m = PROIBIDAS.search(txt)
            if m: e(f'{campo} contém "{m.group(0)}"')
    return erros


def bloco(slides):
    linhas = ',\n'.join('        ' + json.dumps(s, ensure_ascii=False, separators=(',', ':')) for s in slides)
    return '      const POOL = [\n' + linhas + '\n      ];\n'


def main():
    args = sys.argv[1:]
    json_path = ROOT / 'conteudo' / 'tv3-slides.json'
    if '--json' in args:
        json_path = pathlib.Path(args[args.index('--json') + 1])
    slides = json.loads(json_path.read_text(encoding='utf-8'))
    html = HTML.read_text(encoding='utf-8')
    qr_bloco = re.search(r'// QR:BEGIN.*?// QR:END', html, re.S).group(0)
    chaves_qr = set(re.findall(r'^\s+"([^"]+)": \{ url:', qr_bloco, re.M))
    erros = validar(slides, chaves_qr)
    if erros:
        print('\n'.join('ERRO ' + e for e in erros))
        sys.exit(1)
    padrao = re.compile(re.escape(BEGIN) + r'[^\n]*\n(.*?)\s*' + re.escape(END), re.S)
    m = padrao.search(html)
    if not m:
        sys.exit(f'Marcadores {BEGIN} / {END} não encontrados em tv3.html')
    novo = bloco(slides)
    if '--check' in args:
        if m.group(1).strip() != novo.strip():
            sys.exit('tv3.html está desatualizado em relação a conteudo/tv3-slides.json. Rode: python3 scripts/tv3-pool.py')
        print(f'POOL do tv3.html em dia ({len(slides)} slides).')
        return
    cab = f'{BEGIN} (gerado por scripts/tv3-pool.py a partir de conteudo/tv3-slides.json, não editar à mão)\n'
    HTML.write_text(html[:m.start()] + cab + novo + '      ' + END + html[m.end():], encoding='utf-8')
    print(f'POOL gravado: {len(slides)} slides, {sum(s["dur"] for s in slides)} s no total.')


if __name__ == '__main__':
    main()
