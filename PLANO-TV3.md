# TV3: mídia indoor da sala de espera da Clínica FaçaAmigos

Endereço: `/tv3` (atalhos `/clinica/tv` e `/tv-clinica`). Página interna, noindex.

## Para quem é e o que a TV faz

O pai ou a mãe fica 2 a 3 horas por visita, 2 a 3 vezes por semana, enquanto o filho está em sessão. Já contratou a
clínica (abertura prevista para dezembro/2026). A TV tem **uma ação principal**: fazer o responsável entrar no
**Portal da Família**. O resto do tempo ela orienta, acolhe, conta como funciona a clínica, convida para o
Playground e o Circuito no fim de semana e pede a indicação do Mapeamento.

O nome certo é **Portal da Família**. "Mural" é só uma seção dentro dele. O login é por celular cadastrado e código de
6 números por SMS (CPF só no primeiro acesso), e a tela de entrada abre na aba **Equipe**: por isso o QR vai para
`/familia`, que explica a aba Família e leva ao login.

## Como a TV funciona

- **Volta de ~9 min.** Cada slide aparece uma vez por volta (`a_lembrete` aparece duas). Hoje são 36 a 39 slides por
  volta, conforme o dia do ciclo e o que está ligado. Em 2,5 h o pai vê a volta umas 16 vezes.
- **Abre em `b_boasvindas` e fecha em `a_fecho`.** No meio, as famílias de conteúdo se alternam (nunca duas iguais coladas).
- **QR do Portal a cada 6 min no máximo**, e uma dica (família C) vem antes de cada pedido do Portal.
- **Ciclo de 5 dias** (dia de Belém): troca as dicas (C), os respiros (R) e as fotos de alguns slides.
- **Famílias:** A Portal da Família (12) · B Clínica (9) · C Dicas para casa (8) · D Playground e Circuito (7) ·
  E Indicação do Mapeamento (2) · R Respiro (4). Total 42.
- **QR local.** As matrizes ficam dentro do HTML (`scripts/tv3-qr.py`). A TV não depende de internet para mostrar o QR.
- **Trilha instrumental baixa**, sem voz: 20 faixas do salão, volume 0,12, só no expediente (seg a sex 8h às 18h,
  sáb 8h às 12h), 20 min de música e 10 de silêncio a cada meia hora. Tecla `S` liga e desliga.

## Configuração (`CONFIG`, no topo do script de `tv3.html`)

| Campo | O que faz |
|---|---|
| `portalAtivo` | `false` esconde a família A inteira. Use enquanto o Portal ou o cadastro do celular não estiverem prontos |
| `beneficioFamilia` | Texto do slide `d_beneficio`. Trocar quando o mecanismo do benefício for definido |
| `wifiSsid` | Nome da rede. Vazio esconde Wi-Fi do cabeçalho, do rodapé e o slide `b_wifi` |
| `fotoGraoPara` | Caminho da foto do Grão-Pará. Vazio desliga o slide `d_graopara` |
| `somVolume`, `somTocaMin`, `somPausaMin` | Volume e ciclo da trilha |
| `experiment` | Rótulo do experimento (ver `EXPERIMENTOS-TV3.md`) |

## Parâmetros de URL

`?dia=1..5` força o dia do ciclo · `?exp=rotulo` rótulo do experimento · `?slide=<id>` fixa um slide ·
`?portal=0` esconde a família A · `?som=0|1` força o som · `?rot=90|270` gira o palco (TV deitada) ·
`?debug=1&seed=x&vel=50` só para teste · `?video=1` modo de gravação do MP4 (sem relógio, data e botões).

Teclas: `←` `→` troca, espaço pausa, `R` gira, `F` tela cheia, `S` som. Os botões aparecem com o mouse.

## Instalação na TV (checklist da recepção)

Sem estes itens a TV promete uma ação que falha. Enquanto algum faltar, abra com `?portal=0` ou mude `portalAtivo`.

1. A recepção **cadastra o celular do responsável** na avaliação. Telefone não cadastrado recebe "entre em contato com a recepção".
2. O **SMS com o código** (Twilio) está funcionando em produção para a família.
3. **Cartão de mesa** com o mesmo QR de `/familia` em cada assento. O pai está de celular na mão e a mesa está a 40 cm.
4. A recepção sabe responder **"qual é a condição especial no Playground"** (texto de `beneficioFamilia`).
5. Chrome em modo quiosque com `--autoplay-policy=no-user-gesture-required`. Sem isso, o som espera o primeiro toque.
6. Se a TV está deitada, abrir `/tv3?rot=90` (ou `270` se a imagem ficar de cabeça para baixo).
7. Foto do Grão-Pará em `img/` e `fotoGraoPara` preenchido liga o slide `d_graopara`.
8. Revisão da Isabella dos slides marcados **[ISABELLA]** em `conteudo/tv3-roteiro-slides.md`.

## Como mudar um texto

1. Edite `conteudo/tv3-slides.json` (o que a TV mostra) e o mesmo trecho em `conteudo/tv3-roteiro-slides.md` (versão
   legível, com a fonte de cada fato).
2. `python3 scripts/tv3-pool.py` valida (tamanho, palavras proibidas, QR existente) e grava no `tv3.html`.
3. Mudou uma URL de QR? Edite `QR_URLS` em `scripts/tv3-qr.py` e rode `python3 scripts/tv3-qr.py`. Precisa de `pip install segno`.
4. `node scripts/tv3-test.mjs` (precisa de Playwright e de `npm i --no-save jsqr pngjs`; ver o cabeçalho do arquivo).

**Regras de texto:** nunca "promessa", "confiança", "oferta", "garantido", "cura"; nunca "criança normal/especial";
sem exclamação; sem convênio; sem prognóstico; número só com fonte. O validador barra o que dá para barrar.

## O que os testes verificam (`scripts/tv3-test.mjs`)

- Todo QR da tela decodifica na URL esperada, em paisagem e girado; o do tutorial mede 360 px ou mais.
- Em 1.500 voltas simuladas: abertura, fechamento, famílias alternadas, ausência de repetição, QR do Portal a cada 6 min e dica antes do pedido.
- Nenhum texto estoura o cartão nos 42 slides, em paisagem e girado.
- A trilha toca nos horários certos, pausa no ciclo, respeita `?som=0` e a tecla `S`, e as 20 faixas existem.

## Vídeo MP4 para pen-drive (TV sem navegador)

A TV da sala (Roku, em pé) não tem navegador, então a tv3 vai para ela como vídeo. `node scripts/tv3-video.mjs` grava a
página em `tv3.html?video=1` e gera `video/tv3-sala-de-espera.mp4` (a pasta `video/` não entra no git).

- **Conteúdo:** uma volta de cada dia do ciclo (1 a 5), em sequência, ~75 min. A TV repete o arquivo (ligar "repetir" no player USB).
- **`?video=1`** esconde o relógio, a data e os botões, e troca as boas-vindas ("Bom dia, hoje é…") por um texto fixo
  (`CONFIG.textosVideo`). Sem som. A ordem dos slides é fixa (seed por dia).
- **Giro já no arquivo:** 1920x1080 com o conteúdo girado 90° no sentido horário, porque a TV foi virada no sentido
  anti-horário (a borda de baixo original fica à direita) e o player USB não gira vídeo. Imagem de cabeça para baixo:
  `node scripts/tv3-video.mjs --so-girar --giro 270` (refaz em minutos, a partir de `video/tv3-master-vertical.mp4`).
- **Teste rápido de giro:** `node scripts/tv3-video.mjs --teste` gera `video/tv3-teste-rotacao.mp4` (15 s, "ESTE LADO PARA CIMA").
- **O vídeo não se atualiza:** mudou um slide, um texto ou um QR, gere de novo e troque o arquivo no pen-drive.
- Formato: H.264 High 4.1, yuv420p, 30 fps, sem áudio. Pen-drive em FAT32 aceita até 4 GB por arquivo.

## Limites conhecidos

- A volta tem ~9 min, não 11: os filtros por dia e os slides desligados reduzem o miolo. Para alongar, escrever mais
  slides (com revisão da Isabella), não repetir os mesmos.
- A nota "4,9 em 118 avaliações" e o "+1.100 famílias" são números do **Playground** (sistema do quiosque, jul a out/2026).
  Atualizar `d_prova` se a TV for ao ar bem depois. A clínica não tem número próprio ainda e nenhum slide inventa um.
- A licença das 20 faixas instrumentais não está documentada no repositório.
- O celular do pai só chega ao login do sistema se a recepção cadastrou o número (item 1 do checklist).

## Pendências em outros lugares (não resolvidas aqui)

- `clinica_facaamigos`: aceitar `?perfil=familia` em `/login` (hoje abre na aba Equipe). Depois disso `/familia` pode virar redirecionamento.
- `clinica_facaamigos`: o robô de WhatsApp diz para remarcar "por aqui mesmo", enquanto a falta é avisada pelo portal. Alinhar as duas respostas.
- `clinica_facaamigos`: avisar o pai quando a coordenação responder (hoje ele só vê ao abrir o portal).
- `clinica_facaamigos`: a barra de progresso das metas é fixa em 65%.
- `clinica_facaamigos`: a pasta "Modelos de PDF PLanos" tem dados reais de pacientes de terceiros. Tirar do Git.
- `clinica.html` (este repositório): a seção do Mural foi colada sem fechar `</div>` e `</section>` e promete funções que o portal não tem
  (evolução em tempo real, "resposta garantida", justificativa por recibo).
