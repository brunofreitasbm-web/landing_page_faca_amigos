#!/usr/bin/env python3
"""Gera as fotos da /tv3 em public/img/tv/ com brilho, cor e nitidez a mais, para o painel limitado da TV de 32" (HD).

Por que arquivos prontos e não filtro CSS: filtro em foto de tela cheia com zoom animado pesa na GPU de TV HD, e o
navegador reduz a foto de forma simples (macia). Aqui a foto é reduzida com Lanczos para o tamanho que a TV usa e só
depois recebe a máscara de nitidez. As fotos originais (usadas pelo site) não mudam.

  - brilho: curva gama 0,86 (levanta os tons médios e as sombras sem estourar o claro)
  - cor: saturação +25%
  - contraste: +5%
  - nitidez: máscara de nitidez (raio 1,2, 105%) depois da redução
  - tamanho: fotos horizontais e verticais "de cobertura" até 1400 px de largura; fotos "-v" (na lateral) até 1200 px de altura

Uso:
  python3 scripts/tv3-imagens.py            # gera as cópias e acerta os caminhos em conteudo/tv3-slides.json e no tv3.html
  python3 scripts/tv3-imagens.py --check    # falha se alguma foto da TV não tem a cópia atualizada
Depois rode: python3 scripts/tv3-pool.py
"""
import json
import pathlib
import re
import sys

from PIL import Image, ImageEnhance, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUB = ROOT / 'public'
JSON = ROOT / 'conteudo' / 'tv3-slides.json'
HTML = PUB / 'tv3.html'
DESTINO = 'img/tv'

GAMA, SATURACAO, CONTRASTE = 0.86, 1.25, 1.05
NITIDEZ = dict(radius=1.2, percent=105, threshold=2)
LARGURA_MAX, ALTURA_MAX_V = 1400, 1200
# ilustrações e logos já têm cor própria: ficam como estão
IGNORAR = re.compile(r'(^|/)(mascote|mascotes|pacotes|logo)[-/.]|/pacotes/')

LUT = [round(255 * ((i / 255) ** GAMA)) for i in range(256)]


def melhorar(origem: pathlib.Path, destino: pathlib.Path):
    im = Image.open(origem).convert('RGB')
    w, h = im.size
    vertical = origem.stem.endswith('-v')
    k = min(1.0, (ALTURA_MAX_V / h) if vertical else (LARGURA_MAX / w))
    if k < 1:
        im = im.resize((round(w * k), round(h * k)), Image.LANCZOS)
    im = im.point(LUT * 3)
    im = ImageEnhance.Color(im).enhance(SATURACAO)
    im = ImageEnhance.Contrast(im).enhance(CONTRASTE)
    im = im.filter(ImageFilter.UnsharpMask(**NITIDEZ))
    destino.parent.mkdir(parents=True, exist_ok=True)
    im.save(destino, 'WEBP', quality=82, method=6)


def caminhos(slides, html):
    achados = set()
    for s in slides:
        for c in [s.get('image')] + list(s.get('images', [])):
            if c and c.startswith('img/') and not IGNORAR.search(c):
                achados.add(c)
    m = re.search(r"fotoGraoPara: '([^']+)'", html)
    if m and m.group(1).startswith('img/'):
        achados.add(m.group(1))
    return sorted(achados)


def para_tv(c):
    return c if c.startswith(DESTINO + '/') else f'{DESTINO}/{pathlib.PurePosixPath(c).name}'


def original_de(c):
    """Foto original (a do site) de um caminho da TV. Os nomes são únicos entre public/img e public/img/tv3."""
    if not c.startswith(DESTINO + '/'):
        return PUB / c
    nome = pathlib.PurePosixPath(c).name
    for pasta in ('img', 'img/tv3'):
        if (PUB / pasta / nome).exists():
            return PUB / pasta / nome
    raise SystemExit(f'Não achei a foto original de {c} em public/img nem em public/img/tv3')


def main():
    check = '--check' in sys.argv
    slides = json.loads(JSON.read_text(encoding='utf-8'))
    html = HTML.read_text(encoding='utf-8')
    fontes = caminhos(slides, html)
    faltando = []
    antes = depois = 0
    for c in fontes:
        orig = original_de(c)
        dest = PUB / para_tv(c)
        if check:
            if not dest.exists() or dest.stat().st_mtime < orig.stat().st_mtime:
                faltando.append(c)
            continue
        melhorar(orig, dest)
        antes += orig.stat().st_size
        depois += dest.stat().st_size
    if check:
        if faltando:
            sys.exit('Falta a cópia da TV (rode scripts/tv3-imagens.py) de: ' + ', '.join(faltando))
        print('Fotos da TV em dia.')
        return
    # acerta os caminhos
    def troca(c):
        return para_tv(c) if c and c.startswith('img/') and not IGNORAR.search(c) else c
    for s in slides:
        if s.get('image'): s['image'] = troca(s['image'])
        if s.get('images'): s['images'] = [troca(c) for c in s['images']]
    JSON.write_text(json.dumps(slides, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    html = re.sub(r"(fotoGraoPara: ')(img/[^']+)(')", lambda m: m.group(1) + troca(m.group(2)) + m.group(3), html, count=1)
    HTML.write_text(html, encoding='utf-8')
    print(f'{len(fontes)} fotos: {antes/1e6:.1f} MB (originais) -> {depois/1e6:.1f} MB em public/{DESTINO}/')


if __name__ == '__main__':
    main()
