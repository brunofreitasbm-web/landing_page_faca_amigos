# Auditoria de banda das TVs (tv, tv2 e tv3)

Data: 02/11/2026. Escopo: `public/tv.html` (Playground), `public/tv2.html` (Circuito) e `public/tv3.html` (Clínica).

**Como ler.** Marquei cada número como **medido** (vem dos arquivos do repositório: tamanho, bitrate, duração, contagem) ou **estimado** (conta feita em cima dos medidos, com a premissa escrita). Não consegui medir o tráfego real de uma TV, porque isso depende do navegador dela. O passo 1 abaixo resolve isso.

## Resumo

1. **O áudio é o maior consumo.** Os MP3 estão a ~192 kbps, o que dá **86 MB por hora de música**. As imagens pesam pouco perto disso.
2. **A pasta `/audio/` não tem regra de cache no `vercel.json`** (`/img/`, `/assets/` e `/video/` têm). Cada faixa tocada pode ser baixada de novo.
3. **Se o navegador da TV não guarda cache, a tv (Playground) pode passar de 1 GB por dia** e a tv3 de 1 GB por dia (música + fotos). Se guarda, o consumo cai para algumas dezenas de MB, só no primeiro dia.
4. **A tv2 (Circuito) praticamente não consome**: o som é sintetizado no navegador e as fotos são carregadas uma vez por dia.
5. Dá para cortar o consumo sem perder qualidade perceptível: cache de áudio, MP3 a 128 kbps e cache de fotos em memória na tv3.

## O que cada TV carrega

| TV | Áudio | Imagens | Quando carrega | Origem |
|---|---|---|---|---|
| `tv` (Playground) | 40 faixas, 109 MB no total, a ~192 kbps. Toca direto das 10h às 22h; das 22h às 10h fica em stand-by sem som | 20 imagens, 3,0 MB no total | Fotos: uma vez por carga da página (as telas ficam todas no DOM). Música: continuamente | medido |
| `tv2` (Circuito) | **Nenhum arquivo.** Som sintetizado (Web Audio) | 19 telas, 2,4 MB em WebP | Uma vez por carga (recarrega 1x por dia às 6h) | medido |
| `tv3` (Clínica) | 20 faixas, 66 MB no total, a ~192 kbps. Só no expediente (seg a sex 8h às 18h, sáb 8h às 12h), 20 min de música e 10 min de silêncio | 18 imagens distintas, 2,9 MB. **A foto é recriada a cada slide**, então o navegador pede o arquivo de novo toda vez que a tela volta | A cada slide, e uma volta tem 60 slides | medido |

Itens comuns às três páginas:

- **Google Fonts** (Fredoka e Nunito, em 2 domínios do Google) a cada carga da página. Não medi o peso; estimo na casa de 100 a 250 KB por carga.
- **GTM e Google Analytics** via `fa-track.js`. O Clarity só carrega depois de aceite, e a TV nunca aceita, então não carrega. Na tv3, cada troca de slide dispara um evento (`tv3_slide`), cerca de 240 por hora. Estimo menos de 10 MB por dia no total.
- **Fotos novas da fotógrafa** (Supabase): um `manifest.json` por hora, sem cache, e fotos WebP de 1600 px que o script de sincronização grava como imutáveis (cache longo). Peso do manifesto: pequeno.
- **tv (Playground)**: WebSocket do Supabase Realtime com batimento a cada 30 s. Consumo desprezível.

## Estimativa por dia

Premissas: música a 192 kbps = 86 MB/h; tv3 e tv ligadas no expediente indicado acima; volta da tv3 de ~11,8 min com 60 slides.

| Item | Sem cache no navegador da TV | Com cache funcionando |
|---|---|---|
| tv: música (12 h) | **até ~1.000 MB** (menos nos momentos em que o som pausa para as dinâmicas) | 109 MB só no 1º dia |
| tv3: música (10 h, 2/3 do tempo) | **~575 MB** | 66 MB só no 1º dia |
| tv3: fotos (5 voltas por hora, 9,5 MB cada, 10 h) | **~480 MB** | 2,9 MB só no 1º dia |
| tv2: tudo | ~3 MB | ~3 MB |
| tv, tv2 e tv3: fontes e rastreamento | 10 a 20 MB | menos de 10 MB |

A coluna da esquerda é o pior caso. A direita é o melhor. O consumo real das TVs fica entre as duas e só se descobre medindo.

## O que fazer, em ordem

### 1. Medir antes de mudar (sem custo)

Olhar o contador de tráfego por aparelho no roteador (ou no ponto de acesso) para cada TV durante 1 hora, com a TV rodando normalmente. Se o consumo por hora ficar perto de 90 MB (música) mais as fotos, o navegador da TV não está guardando cache e os itens 2 a 4 valem muito. Se ficar em poucos MB, o cache funciona e o ganho vem do tamanho do MP3 só no primeiro dia.

Também ajuda saber a marca, o modelo e o sistema de cada TV (Tizen, webOS, Android TV), porque isso decide o item 5.

### 2. Cache para `/audio/` (uma linha no `vercel.json`)

Hoje o áudio sai sem `Cache-Control`. Incluir uma regra para `/audio/(.*)` com `public, max-age=604800, stale-while-revalidate=2592000` (7 dias, como `/img/`). Não muda nada visual nem sonoro. Risco: ao trocar uma faixa mantendo o mesmo nome, a TV pode levar até 7 dias para pegar a nova. Para trocar na hora, renomear o arquivo.

### 3. MP3 de 192 para 128 kbps

| Bitrate | Música por hora | 60 faixas | Redução |
|---|---|---|---|
| 192 kbps (hoje) | 86 MB | 176 MB | |
| **128 kbps** | **58 MB** | **117 MB** | **-33%** |
| 112 kbps | 50 MB | 102 MB | -42% |
| 96 kbps | 43 MB | 88 MB | -50% |

Para música de fundo em caixa de TV, 128 kbps é a melhor troca entre peso e qualidade e continua em MP3, formato que toda TV toca. Recomendo converter 3 faixas de teste e ouvir na própria TV antes de converter as outras. Como o repositório guarda os MP3, convém manter os originais fora do site (por exemplo no Drive).

### 4. Fotos da tv3 guardadas em memória

A tv3 depende do cache HTTP do navegador para não baixar a mesma foto a cada volta. Dá para baixar cada foto uma única vez e guardá-la em memória (~3 MB) até a recarga das 4h, e usar essa cópia nos slides. Funciona mesmo em TV com cache minúsculo ou desligado. É uma mudança pequena no `tv3.html` e eu posso fazer.

### 5. Guardar música no próprio aparelho (só depois de medir)

Se as TVs aceitarem Service Worker (depende do modelo), dá para baixar a trilha uma vez e tocar do aparelho, sem rede durante o dia. Em algumas TVs antigas o navegador nem suporta isso, e o cache de mídia pode ser limitado. Por isso fica depois da medição e da resposta sobre os modelos.

### 6. Menor impacto

- **Fontes do Google dentro do site.** Evita 2 conexões externas (DNS e TLS) a cada carga, o que pesa mais que os KB em internet lenta. Ganho pequeno em banda.
- **Rastreamento nas TVs.** Manter na tv3 (os experimentos usam o `dataLayer`). Na tv e na tv2, avaliar se alguém usa esses dados; se não, tirar economiza ~250 KB por carga e dezenas de conexões.
- **Modo "fechado" na tv3 e na tv2.** A tv já entra em stand-by das 22h às 10h. Se a tv3 e a tv2 ficam ligadas fora do expediente, uma tela parada nesse horário evita trocar slide e baixar fotos à toa.

### O que não recomendo

- **Reduzir a qualidade das fotos de forma geral.** As fotos verticais (1440x1920) em slides de tela cheia já estão no limite da nitidez, e fotos pequenas ficam borradas numa TV Full HD. As fotos pesam pouco (2,9 MB no total na tv3) e o ganho não compensa.
- **Trocar MP3 por Opus ou AAC.** Menos bytes, mas TVs antigas podem não tocar. Risco de ficar sem música em alguma unidade.
- **Baixar o bitrate abaixo de 112 kbps** sem teste de audição na TV real.

## Resultado esperado

Depende do que a medição do item 1 mostrar. Todos os números abaixo são estimativas.

- **O navegador da TV já guarda cache.** O consumo diário já é baixo hoje. Os itens 2 e 3 reduzem o primeiro dia (-33% nos MP3) e protegem contra o cache ser apagado.
- **O navegador da TV não guarda cache de áudio.** O cabeçalho do item 2 não resolve sozinho, porque a TV nem guarda o arquivo. Sobram o MP3 de 128 kbps e as fotos em memória: tv3 de ~1.055 MB/dia para ~390 MB/dia (música 6,7 h x 58 MB/h, fotos ~3 MB) e tv de ~1.000 MB/dia para ~700 MB/dia (12 h x 58 MB/h). Para ir além disso, só tocando a música de um arquivo guardado no aparelho (item 5), que depende do modelo da TV.
