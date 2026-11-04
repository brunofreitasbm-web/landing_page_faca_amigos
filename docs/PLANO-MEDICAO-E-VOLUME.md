# Plano 1 (medição) e 5 (volume de busca)

Data: 04/11/2026. O que o código já resolve, o que só dá para fazer dentro do GA4, do GTM e do Google Ads, e como fazer cada coisa.

## 1. Corrigir a medição

### 1.1 TVs fora do GA4
| Página | Antes | Agora |
|---|---|---|
| `/tv`, `/tv2`, `/tv3` | Já estavam sem GTM e GA4 (`data-fa-sem-tag`) | Sem mudança |
| `/tv-controle` (celular da equipe) | Carregava GTM, GA4, banner e Clarity | `data-fa-kiosk data-fa-sem-tag`: nada carrega |
| `/musica` (player do salão) | Idem | Idem |

Se ainda aparecer TV no GA4, a causa não é o código desta pasta. Procure no GA4, em Relatórios > Páginas e telas, o que ainda tem `tv`, `musica` ou `tv-controle`. Se o tráfego for de antes de hoje, é histórico. Se continuar entrando, é o dispositivo carregando um endereço antigo em cache. Recarregue a TV.

### 1.2 Candidatos separados dos clientes
O `fa-track.js` agora manda o parâmetro **`publico`** em todos os eventos, inclusive o `page_view`:
- `candidato`: `/trabalhe-conosco` e as vagas.
- `interno`: TVs, `/tv-controle`, `/musica`, `/gestao`, `/admin` (sem GA4 no caso das TVs; vale só para o que ainda carrega).
- `cliente`: o resto.

Também vai para o dataLayer como variável `publico`, para usar no GTM.

**O que você precisa fazer no GA4 (o código não faz):**
1. Admin > Definições personalizadas > Dimensões personalizadas > Criar: nome `Público`, escopo **Evento**, parâmetro `publico`.
2. Em Explorações e relatórios, filtrar `Público = cliente`.
3. Em Admin > Filtros de dados, criar o filtro de tráfego interno se a equipe acessar o site da rede da clínica (opcional, depende do IP).
4. Conferir que `job_application_submit` **não** está marcado como conversão. Ele é do candidato, não do cliente.

Só vale daqui para frente. O histórico não é reclassificado.

### 1.3 `/trabalhe-conosco` e `/teste` no DebugView
Isso não dá para fazer pelo código: o DebugView só existe dentro do GA4. O que o código mostra:

| Hipótese | Evidência no código | Como confirmar no DebugView |
|---|---|---|
| **`/teste` registra view a mais** | `fa-back.js` empilha o histórico do navegador (`pushState`, mesma URL) a cada tela do mapeamento. O GA4 com a medição avançada ligada em "Alterações de página com base em eventos do histórico do navegador" pode contar `page_view` extra | Abrir `/mapeamento`, avançar 3 telas e ver se aparecem `page_view` novos. Se aparecerem, desligar essa opção em Admin > Fluxos de dados > Medição avançada |
| **`page_view` em dobro** | O `fa-track.js` já dispara `gtag('config')`. Se a tag GA4 do GTM também enviar `page_view`, são dois por página (o comentário no arquivo já avisa) | No DebugView, abrir uma página simples (`/clinica`) e ver se vêm 2 `page_view` no mesmo segundo |
| **`/teste` recebia tráfego de outra fonte** | O link do Wi-Fi (`utm_source=wifi`), a TV da clínica (QR) e o WhatsApp de follow-up apontam para `/teste` | Em Aquisição, filtrar por `utm_source` e ver quanto do tráfego da página vem de `wifi`, `tv3` e `whatsapp` |
| **`/trabalhe-conosco` recebe visita de cliente** | A faixa "Estamos contratando →" fica no topo da home, a mais vista do site | Ver a taxa de cliques dessa faixa (`pagina` = `/`, destino `/trabalhe-conosco`) |
| **GA4 ainda mostra `/teste`** | O `/teste` agora responde 301 para `/mapeamento` | `/teste` some dos relatórios novos. Os dois caminhos aparecem somados só no período de transição |

### 1.4 Eventos de WhatsApp, formulário e agendamento

**Corrigido: o WhatsApp da `/clinica` estava subcontado.** Os 15 botões de WhatsApp por especialidade (Terapia ABA, Psicologia, Fono etc.) tinham `data-fa-link`, e o `fa-track.js` tratava qualquer link com `data-fa-link` como clique interno e saía antes de ver o WhatsApp. Resultado: esses cliques viravam `cta_click` com destino `/5591...` e **nunca entravam em `whatsapp_click`**, que é a conversão. O arquivo agora olha o WhatsApp primeiro. Os atributos, classes e `href` dos botões não mudaram. O clique agora gera `whatsapp_click` com `unidade=clinica` e `cta_location` com o nome do botão (ex.: `clinica_svc_wa_aba`).

Testado em navegador headless, em `/clinica`:
- Botão "ABA" → `whatsapp_click` (unidade `clinica`, `cta_location` `clinica_svc_wa_aba`).
- "Agendar avaliação" do hero → `whatsapp_click` (unidade `clinica`).

**Atenção:** o número de `whatsapp_click` da clínica vai subir de uma vez. Não é aumento de demanda. É a correção. Para comparar semanas, use só dados a partir de hoje.

| Conversão | Evento no código | Estado |
|---|---|---|
| WhatsApp | `whatsapp_click` (com `unidade`: `clinica`, `playground_circuito`, `playground_graopara`) | OK em todas as páginas do site. Fora do site: `descadastrar.html` e `NEWVITTA/` não têm o script |
| Formulário (mapeamento) | `generate_lead` (`lead_source=teste_comportamento`) e `teste_lead` | OK. O nome do evento mantém "teste" de propósito |
| Formulário (evento) | `evento_inscricao` e `generate_lead` (só se confirmada ou lista de espera) | OK |
| Formulário (vaga) | `job_application_submit` | OK, e agora marcado como `candidato` |
| Agendamento | **Não existe evento próprio.** O site não tem agenda. O "agendar" é o clique em "Agendar avaliação" no WhatsApp | Conta como `whatsapp_click`. Os cliques do hero também geram `clinica_cta_click` (`cta_location=hero_agendar`) |

Pergunta para você: "agendamento" no seu plano é o clique em "Agendar avaliação" ou existe uma agenda online que eu não vi? Se for a primeira, está coberto.

**Para conferir no GTM (modo Preview), depois do deploy:**
1. `/clinica` → botão "ABA" dispara `whatsapp_click` com `cta_location`.
2. `/playground` → botão de WhatsApp dispara `whatsapp_click` com `unidade=playground_circuito`.
3. `/circuito` → idem.
4. `/mapeamento` → concluir um mapeamento dispara `generate_lead`.
5. `/trabalhe-conosco` → enviar uma candidatura dispara `job_application_submit`, e **não** dispara `generate_lead`.
6. Nenhuma tag nova do GA4 duplicando o `page_view`.

## 5. Volume de busca (Planejador de Palavras-chave)

Não consigo medir o volume daqui: esta sessão não tem acesso ao Google Ads, ao GA4 nem ao Search Console (o único conector de dados ligado é o do Instagram). Os números precisam sair do Planejador, na sua conta. O arquivo `docs/palavras-chave-planejador.csv` tem a lista pronta para colar no Planejador (Descobrir novas palavras-chave > Começar com uma lista de palavras-chave; local: Belém, idioma: português). Depois exporte e preencha as duas colunas vazias.

Como ler o resultado:
- Compare **volume médio mensal** entre termos da mesma intenção, não entre intenções.
- Em Belém o volume costuma ser baixo e aparecer em faixas ("10 a 100"). Isso não significa que o termo não vale: serve para escolher entre dois nomes, não para estimar visitas.
- O Planejador mede busca no Google Ads. Complete com o Search Console depois de 4 semanas, que mostra o que de fato trouxe visita.
- Termos de compra ("comprar", "preço", "24v") devem ser marcados e **não** usados em título. O Circuito já sofre com isso.

## 6. O que os dados do GA4 mostram (04/11/2026, últimos 30 dias, propriedade "Clinica FaçaAmigos")
Lido pelo conector do Windsor. São 940 `page_view` no domínio principal. Volume baixo: leia como tendência, não como número exato.

| Achado | Dado | O que fazer |
|---|---|---|
| **`form_start` inflado em `/trabalhe-conosco`** | 957 `form_start` contra 69 `page_view` e 164 sessões (14 por visita). É o evento automático da medição avançada, não vem do nosso código | Desligar "Interações com formulários" na medição avançada (Admin > Fluxos de dados). Não usar `form_start` como conversão |
| **Candidatura não aparece** | `job_application_submit` não existe no GA4, mesmo o site disparando no dataLayer | Conferir no GTM se existe tag que envia esse evento ao GA4. Só chegam ao GA4: `whatsapp_click`, `cta_click`, `generate_lead`, `begin_checkout`, `scroll_depth`, `maps_click`, `phone_click` |
| **Passos do mapeamento não aparecem** | Nenhum `teste_*` no GA4. Só `form_start` (20) e `generate_lead` (7) | Mesma conferência no GTM. Sem isso não dá para ver onde as pessoas abandonam o mapeamento |
| **Sessões sem `page_view`** | 2.003 `session_start` contra 940 `page_view`. Antes de 16/10 era o inverso | Hipótese, não confirmada: o consentimento negado por padrão faz cada evento sem cookie contar como sessão nova. Confirmar no DebugView |
| **Pico de 16 e 17/10** | 719 sessões e 164 cliques de WhatsApp na home em 2 dias, quase tudo do Instagram (`ig` 297, `l.instagram.com` 194) e direto (155) | Foi campanha ou post, e os cliques parecem reais. `l.instagram.com` sem UTM não identifica qual post foi: colocar UTM nos links do Instagram |
| **TVs ainda no histórico** | `/tv` 17, `/tv2` 17, `/tv3` 22, `/musica` 5 views, com 54, 31, 11 e 31 sessões | É histórico, de antes do `data-fa-sem-tag`. Conferir por data se ainda entram depois do deploy do PR #127 |
| **Tráfego que não é de cliente** | `localhost` (9 views), 3 domínios de preview da Vercel (8 views) e `192.168.30.1` (roteador). Também `clinica.institutofacaamigos.com.br` (67 views), o host antigo | Criar filtro de dados por nome do host: manter só `institutofacaamigos.com.br` e `playground.` |
| **WhatsApp concentrado na home** | 295 dos 381 `whatsapp_click` vêm de `/`. A `/clinica` tem só 20, e esse número estava subcontado (ver 1.4) | Reler depois do deploy |
| **`/trabalhe-conosco`** | 69 views: direto 30, Instagram 28, Google 5. Não é cliente se perdendo | Já separado pelo parâmetro `publico` |
| **`/teste`** | 12 views. Não há sinal de view duplicada | A hipótese do `fa-back.js` não se confirma neste volume |
