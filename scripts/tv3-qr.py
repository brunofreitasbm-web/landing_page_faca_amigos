#!/usr/bin/env python3
"""Gera os QR codes da /tv3 e grava o bloco `const QR` dentro de tv3.html.

Os QR ficam pré-gerados (sem biblioteca no navegador e sem serviço externo):
funcionam com a TV sem internet. As URLs são estáticas de propósito: a UTM de
experimento vai no link de saída da página de destino, não no QR.

Uso:
  pip install segno
  python3 scripts/tv3-qr.py            # regrava o bloco entre // QR:BEGIN e // QR:END
  python3 scripts/tv3-qr.py --check    # falha se o bloco do tv3.html não bate com este arquivo

Ao trocar uma URL: edite QR_URLS aqui, rode o script e confira com scripts/tv3-test.mjs.
"""
import json
import pathlib
import re
import sys

import segno

HOME = 'https://institutofacaamigos.com.br'

# chave usada em tv3.html -> URL exata codificada no QR
QR_URLS = {
    'portal': f'{HOME}/familia',
    'graopara': f'{HOME}/playground/grao-para?utm_source=tv3&utm_medium=indoor',
    'planos': f'{HOME}/planos?utm_source=tv3&utm_medium=indoor',
    'avaliar': 'https://g.page/r/CUpdqF5yECeVECE/review',
    'teste': f'{HOME}/teste?utm_source=tv3&utm_campaign=indicacao',
    'aprender:rotina': f'{HOME}/aprender/rotina-visual-em-casa?utm_source=tv3',
    'aprender:crise': f'{HOME}/aprender/birra-ou-crise?utm_source=tv3',
    'aprender:brincar': f'{HOME}/aprender/brincar-com-proposito-10-minutos?utm_source=tv3',
    # provisórios: saem quando o motor de voltas (POOL) substituir a lista antiga de slides
    'playground': f'{HOME}/playground?utm_source=tv3&utm_medium=indoor',
    'circuito': f'{HOME}/circuito?utm_source=tv3&utm_medium=indoor',
    'clinica': f'{HOME}/clinica?utm_source=tv3&utm_medium=indoor',
}

ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML = ROOT / 'public' / 'tv3.html'
BEGIN = '// QR:BEGIN'
END = '// QR:END'


def matriz(url):
    # nível M, sem subir a correção automaticamente: menos módulos = leitura de mais longe
    q = segno.make(url, error='m', boost_error=False, micro=False, mask=None)
    linhas = [''.join('1' if c else '0' for c in row) for row in q.matrix]
    return q.version, linhas


def bloco():
    partes = []
    for chave, url in QR_URLS.items():
        versao, linhas = matriz(url)
        partes.append(f"        {json.dumps(chave)}: {{ url: {json.dumps(url)}, v: {versao}, m: {json.dumps(linhas, separators=(',', ':'))} }}")
    return '      const QR = {\n' + ',\n'.join(partes) + '\n      };\n'


def main():
    html = HTML.read_text(encoding='utf-8')
    padrao = re.compile(re.escape(BEGIN) + r'[^\n]*\n(.*?)\s*' + re.escape(END), re.S)
    m = padrao.search(html)
    if not m:
        sys.exit(f'Marcadores {BEGIN} / {END} não encontrados em tv3.html')
    novo = bloco()
    if '--check' in sys.argv:
        if m.group(1).strip() != novo.strip():
            sys.exit('tv3.html está desatualizado em relação a scripts/tv3-qr.py. Rode: python3 scripts/tv3-qr.py')
        print('QR do tv3.html em dia.')
        return
    cabecalho = f'{BEGIN} (gerado por scripts/tv3-qr.py, não editar à mão)\n'
    html = html[:m.start()] + cabecalho + novo + '      ' + END + html[m.end():]
    HTML.write_text(html, encoding='utf-8')
    for chave, url in QR_URLS.items():
        v, ls = matriz(url)
        print(f'{chave:18} versão {v:2} ({len(ls)}x{len(ls)})  {url}')


if __name__ == '__main__':
    main()
