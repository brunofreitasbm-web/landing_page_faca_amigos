# Relatório SEO: Fases 1 (Clínica), 2 (Playground) e 3 (Circuito)

Data: 04/11/2026 · Branch: `claude/bold-lamport-7c0kw5` · Merge em `main` só com aprovação do Bruno.

Escopo seguido: title, meta description, Open Graph, H1, H2, slug do mapeamento e JSON-LD. O corpo do texto não foi reescrito. Nos heroes, a frase de marca ("Respira...", "Ele brinca seguro...", "Seu filho no volante...") continua com o mesmo visual de título, só que agora num `<p class="h1-look">`. O H1 com a frase de busca entrou acima dela.

Botões de WhatsApp: os `href`, `data-cta` e `data-fa-link` não mudaram. Os links que levavam a `/teste` agora levam a `/mapeamento`, e o `data-fa-link` continua o mesmo.

## Fase 1: Clínica

### /clinica
| Item | Antes | Depois |
|---|---|---|
| title / og:title | Clínica Infantil em Belém: ABA, Fono, T.O. e mais \| FaçaAmigos | Terapia ABA e Fonoaudiologia Infantil em Belém \| FaçaAmigos (59) |
| description / og | Clínica infantil no Umarizal, Belém/PA: Terapia ABA, Psicologia, Fono, T.O., ... | Centro de Terapia Comportamental no Umarizal: ABA, fonoaudiologia, terapia ocupacional e psicologia infantil. Convênios IASEP e PROASA e particular. (148) |
| H1 | Respira. Aqui seu filho é visto, e você também. | Terapia infantil para autismo, TDAH e atraso na fala, no Umarizal ("Respira..." virou o parágrafo de destaque) |
| H2 | 15 serviços e especialidades | Terapia ABA, fonoaudiologia e terapia ocupacional no mesmo endereço ("15 serviços e especialidades" foi para o eyebrow) |
| H2 | Para quem é | Quando procurar ajuda: comportamentos que merecem atenção |
| H2 | Convênio ou particular: você escolhe | Atendimento pelos convênios IASEP e PROASA ou particular |
| H3 | Mapeamento grátis | Mapeamento do desenvolvimento ("grátis" saiu do heading e ficou só nos botões) |
| JSON-LD | MedicalClinic (subtipo de MedicalBusiness) | Mantido. Só o `name` do WebPage mudou |

H2 "O que é a terapia ABA e como ela funciona no dia a dia": **não aplicado**. A página não tem uma seção sobre isso, e a regra era não criar seção vazia. Esse conteúdo já existe em `/clinica/terapia-aba`.

### / (home)
O hero da home é o da clínica, então recebeu o mesmo H1. O title ficou **diferente** do da /clinica, para as duas URLs não disputarem a mesma busca.
| Item | Antes | Depois |
|---|---|---|
| title / og | FaçaAmigos Belém: Terapia Comportamental e Playground | Terapia Infantil e Espaço Kids em Belém \| FaçaAmigos (52) |
| description / og | Clínica infantil no Umarizal, Belém, atendendo desde novembro de 2026: ... | Terapia ABA, fonoaudiologia e terapia ocupacional no Umarizal, com IASEP, PROASA e particular. Espaço kids no Parque Shopping e no Grão-Pará. (141) |
| H1 | Respira. Aqui seu filho é visto, e você também. | Terapia infantil para autismo, TDAH e atraso na fala, no Umarizal |
| H2 | Playground e Circuito, sem hora marcada | Espaço kids e circuito de carrinhos, sem hora marcada |

### /teste → /mapeamento
| Item | Antes | Depois |
|---|---|---|
| URL | /teste | /mapeamento. Redirecionamento **301** de `/teste`, `/teste.html` e `/teste/*` (em `vercel.json`; a query string, como as UTMs, é repassada) |
| title / og | Mapeamento Comportamental Infantil Gratuito \| Instituto FaçaAmigos | Mapeamento do Desenvolvimento Infantil \| FaçaAmigos Belém (57) |
| description / og | Mapeamento Comportamental gratuito para crianças de 4 a 17 anos: ... | Um retrato do desenvolvimento do seu filho em 5 minutos, criado por psicóloga. Material informativo, não é diagnóstico. (119) |
| H1 | Pare de se perguntar se é normal. | Como está o desenvolvimento do seu filho? Um retrato em 5 minutos |
| Linha abaixo | (nenhuma) | Material informativo criado por psicóloga. Não é diagnóstico. |
| canonical, sitemap, og:image | /teste, og-teste.jpg | /mapeamento, og-mapeamento.jpg (cópia) |

Links internos atualizados no site inteiro: páginas, artigos de Aprender, rodapé, `fa-footer.js`, wifi, llms.txt e templates. As edge functions `behavior-test-*` não foram renomeadas. Ficaram em `/teste`, cobertos pelo 301: `supabase/email-templates`, `supabase/functions/behavior-test-webhook`, `hotspot/` e `public/tv3.html`. Para atualizar esses, é preciso fazer deploy separado (e, no caso da tv3, mexer no QR).

## Fase 2: Playground

### /playground
| Item | Antes | Depois |
|---|---|---|
| title / og | Playground em Belém \| FaçaAmigos no Parque Shopping | Parquinho e Espaço Kids em Belém \| FaçaAmigos Playground (56) |
| description / og | Playground inclusivo no Parque Shopping Belém, ... A partir de R$ 60, ... | Espaço kids no Parque Shopping e no Shopping Bosque Grão-Pará para crianças de 0 a 12 anos, com mediadores, pulseira de identificação e sem agendamento. (152) |
| H1 | Ele brinca seguro. Você finalmente descansa. | Parquinho e espaço kids no Parque Shopping e no Grão-Pará (substitui a pílula "O playground inclusivo de Belém"; a frase "Ele brinca seguro..." virou destaque) |
| Texto do hero | Você passeia pelo Parque Shopping | Você passeia pelo shopping |
| H2 | É só pra criança autista? Não. É pra todas. | Para todas as crianças de 0 a 12 anos, com ou sem laudo (a pergunta foi para o eyebrow) |
| H2 | É só chegar e brincar | Como funciona: cadastro, pulseira e mediadores no espaço |
| H2 | Quanto custa uma tarde tranquila? | Preços e meia-entrada para crianças com laudo ou CIPTEA (a pergunta foi para o eyebrow) |
| H2 | Playground FaçaAmigos em Belém | Onde fica: Parque Shopping, 1º piso, e Shopping Bosque Grão-Pará, 1º piso, em frente à Renner |
| FAQ (visível e JSON-LD) | "É só chegar entre 10h e 22h, qualquer dia da semana" | "de segunda a sábado, das 10h às 22h, ou no domingo, das 12h às 21h" (o texto antigo contradizia o horário de domingo) |
| JSON-LD | 1 EntertainmentBusiness por unidade, com telefone e horário | Mantido |

O H2 de preços não ficou exatamente como o documento pedia ("Meia-entrada para crianças com laudo ou CIPTEA"). A seção é a tabela inteira de preços, e um H2 só sobre a meia-entrada contradiria a diretriz de dar o mesmo peso a famílias típicas e atípicas.

### /playground/parque-shopping e /playground/grao-para (já existiam)
| Item | Antes | Depois |
|---|---|---|
| title | Playground no {shopping} \| FaçaAmigos | Espaço Kids no Parque Shopping Belém \| FaçaAmigos (49) · Espaço Kids no Shopping Bosque Grão-Pará \| FaçaAmigos (53) |
| description | Playground inclusivo no {shopping}, ... | Espaço kids no {shopping}, {piso}: 0 a 12 anos, sem agendamento. {horário}. (136 / 160) |
| H1 | Playground FaçaAmigos no {shopping} | Espaço kids no {shopping} |
| H2 | Também estamos no {outro} | Também tem espaço kids FaçaAmigos no {outro} |
| FAQ | O Playground é só para crianças com diagnóstico? | O espaço kids é só para crianças com laudo? |
| JSON-LD | LocalBusiness + AmusementPark | LocalBusiness + EntertainmentBusiness (telefone e horário de cada unidade, vindos de `marca.json` e do geo-facts) |

## Fase 3: Circuito (/circuito)
| Item | Antes | Depois |
|---|---|---|
| title / og | Circuito de Carrinhos Elétricos em Belém \| FaçaAmigos | Carrinho Elétrico Infantil no Parque Shopping \| FaçaAmigos (58) |
| description / og | Carrinhos elétricos a partir de R$ 48, direto no piso do Parque Shopping Belém. ... | Passeio de carrinho, moto e pelúcia elétrica para crianças no térreo do Parque Shopping Belém, em frente à C&A. R$ 48 o passeio, sem agendamento. (145) |
| canonical | https://institutofacaamigos.com.br/circuito | Igual |
| Faixa superior | 📍 Parque Shopping Belém · sem agendamento | 📍 Parque Shopping Belém · térreo, em frente à C&A · sem agendamento |
| H1 | Seu filho no volante, você logo ali por perto. | Passeio de carrinho elétrico no Parque Shopping Belém (a frase antiga virou destaque) |
| Hero | direto no piso do Parque Shopping Belém | no térreo do Parque Shopping Belém, em frente à C&A |
| H2 | É só chegar e rodar | Onde fica: térreo do Parque Shopping, em frente à C&A |
| H2 | Quanto custa rodar? | Quanto custa o passeio de carrinho elétrico |
| H3 "Encontre o quiosque" | Direto no piso do Parque Shopping Belém, ... | No térreo do Parque Shopping Belém, em frente à C&A, ... |
| "Escolha o veículo" | Pelúcias e jeep rodam 20 minutos; carros e moto, 30 minutos | Pelúcias motorizadas e jipe rodam 20 minutos; carrinhos e motos, 30 minutos |
| Demais "no piso do" | 6 ocorrências | "no térreo do" |
| Fidelidade | vale no Playground e no Circuito | vale para o Playground e para o Circuito (para não aparecer "no Playground") |
| JSON-LD | LocalBusiness+EntertainmentBusiness, telefone 99234-7673, horário, priceRange "$$" | EntertainmentBusiness "FaçaAmigos Circuito", com a descrição do documento, endereço "Rod. Augusto Montenegro, 4300 — Parque Shopping Belém, térreo, em frente à C&A", CEP 66635-110, priceRange "R$ 48". **Sem telefone, sem horário, sem avaliações.** As ofertas (makesOffer) de R$ 48 foram mantidas |

Os H2 de vídeo, "Aquele momento...", "Vem ver de perto", e-books, mapeamento, FAQ e "Bora ligar o motor" ficaram como estavam. Não existe uma seção própria de veículos: "jipe" e os tempos de 20 e 30 min estão no passo "Escolha o veículo" e na tabela de preços.

Grep no HTML renderizado da /circuito: kart 0, meia 0, R$ 25 0, aluguel 0, festa 0, aniversário 0, "no Playground" 0, "dentro do Playground" 0. **99178 aparece 1 vez (rodapé global)**: depende da decisão do item 4.

## Verificação
- `npm run build && npm run check`: 0 erros. Os 7 avisos já existiam (musica, tv, evento, trabalhe-conosco).
- Cada uma das 7 páginas tem um único H1. Todos os titles têm até 60 caracteres e todas as descriptions até 160. og:title e og:description são iguais ao title e à description.
- Screenshot em 390 px e 1280 px das 5 heroes: sem rolagem horizontal e com a identidade visual mantida.

## Pendências para o Bruno
1. ~~Rodapé por contexto~~: **aprovado e executado em 04/11** (ver seção no fim).
2. **Horário do Circuito:** o JSON-LD já não declara horário. Mas o texto visível (FAQ e chamada final) ainda diz seg–sáb 10h–22h e dom 12h–21h. Se o horário for outro, esse texto está errado hoje.
3. **Sábado da clínica:** o documento diz até 11h45, e o site e o `marca.json` dizem até 12h. O site foi mantido. Corrigir em `marca.json` → `horarioClinica` se o certo for 11h45.
4. **Minuto adicional de R$ 3,00 no Circuito:** continua no site. O documento diz "só o passeio de R$ 48". Confirmar se esse adicional ainda existe.
5. **Preço do Playground:** o "a partir de R$ 60" e a meia-entrada não foram alterados (o MAPA-DO-SITE já registra divergência com o caixa no desconto do Parque).
6. **og:image do Circuito:** continua `og-circuito.jpg` (carrinhos). O quadro do vídeo real depende de exportar a imagem e da autorização das famílias.
7. **Validação ética:** as responsáveis técnicas de fonoaudiologia e de TO precisam aprovar os textos da clínica antes do merge.
8. **Critério de grep `teste`/`diagnóstico`/`cura`:** aplicado a title, description, OG, H1 e H2. No HTML inteiro, ele dá falso positivo: "procurar", "não é diagnóstico" (texto obrigatório), "bateria de testes" na Avaliação Neuropsicológica, a classe CSS `teste.css` e o arquivo `teste-perguntas.json`.

## Depois do deploy
- `curl -I https://institutofacaamigos.com.br/teste` deve responder 301 com `Location: /mapeamento`.
- Search Console: enviar o sitemap e pedir indexação de /, /clinica, /mapeamento, /playground, as duas unidades e /circuito.
- Rich Results Test em /clinica, /playground, /playground/* e /circuito.
- GTM Preview: conferir os eventos de WhatsApp, de formulário (mapeamento) e de agendamento.
- Google Meu Negócio (manual): nomes sem palavra-chave; a descrição abre com "espaço kids"/"parquinho" e, no Circuito, com "Passeio de carrinho elétrico infantil no térreo do Parque Shopping Belém, em frente à C&A".

## Umarizal → Belém (pedido do Bruno, 04/11)
Trocado em titles, descriptions, H1, eyebrows, chips, textos de link ("Conhecer a Clínica FaçaAmigos, em Belém"), alt das fotos e trechos curtos (81 linhas). Nas descriptions que já diziam "em Belém/PA", o "no Umarizal" do fim foi retirado, para não repetir a cidade.

**Mantido de propósito:** o endereço completo (Rua Boaventura da Silva, 1573, Umarizal), o `streetAddress` do JSON-LD, o `bairro` do `marca.json`, o rodapé, termos, política e llms.txt. O Google confere se nome, endereço e telefone batem entre o site e o Google Meu Negócio, e o bairro faz parte do endereço.

## Dependências de /teste (o que pode quebrar e o que foi feito)
| Onde | Como usa /teste | Risco | Ação |
|---|---|---|---|
| `behavior-test-webhook` (Supabase) | Valida só o **domínio** (`Origin`), não o caminho. Grava `landing_page` como texto | Nenhum | Só o rodapé do e-mail de resultado mudou para /mapeamento. **Vale depois do deploy da função** |
| Eventos do dataLayer (`teste_start`, `teste_lead`, `generate_lead` com `lead_source: teste_comportamento`) e `utm_source=teste` nos links de e-book | Nomes de evento e de origem | Renomear quebraria gatilhos do GTM e relatórios | **Não renomeados** |
| GTM / GA4 / Google Ads | Gatilho que dependa de *Page Path* = `/teste` | **Não dá para ver pelo repositório** | Conferir no GTM se algum gatilho ou conversão usa o caminho /teste. Se usar, trocar para /mapeamento |
| Repo `faca_amigos`: `crm-mapeamento-dispatch` (WhatsApp 7 dias) | `MAPEAMENTO_URL` padrão aponta para /teste com UTM | Funciona pelo 301 (a Vercel repassa a query) | Sem mudança de código: dá para definir o secret `MAPEAMENTO_URL` no Supabase com /mapeamento |
| Repo `faca_amigos`: template Meta `fa_mapeamento_followup` | A URL vai na variável {{4}} do corpo, não num botão fixo | Nenhum | Não precisa reaprovar na Meta |
| Repo `faca_amigos`: `MapeamentoBanner.tsx` (QR no app do Playground) e o protótipo | URL fixa com UTM | Funciona pelo 301 | Trocar no próximo deploy do app (repo não alterado aqui) |
| `hotspot/alogin.html` (roteador do Wi-Fi) | Botão "ctaTeste" | Funciona pelo 301 | Atualizado no repo. **Precisa subir o arquivo no roteador** |
| `supabase/email-templates/ebook-d*.html` | Texto do rodapé | Só texto | Atualizado no repo. Vale onde os templates estiverem cadastrados |
| `public/tv3.html` (QR da TV da clínica) | A matriz do QR é pré-calculada para a URL /teste | Funciona pelo 301 | Não alterado. Para trocar, regenerar com `scripts/tv3-qr.py` |
| Bio do Instagram, anúncios, links antigos | /teste | Funciona pelo 301 | Trocar com calma para economizar o salto do redirecionamento |

Depois do deploy, testar: `curl -sI "https://institutofacaamigos.com.br/teste?utm_source=x"` deve responder 301 com `Location: /mapeamento?utm_source=x`.

## Rodapé por contexto (aprovado pelo Bruno em 04/11)
`Base.astro` escolhe o contexto pela seção da página e passa para `Footer.astro`:
| Páginas | Cartões e WhatsApp no rodapé |
|---|---|
| /playground, /playground/*, /circuito | Parque Shopping (99234-7673) e Grão-Pará (99110-1215) |
| /clinica, /clinica/*, /planos, /autismo, /tdah, /neurodivergencia, /aprender, /aprender/*, /glossario, /mapeamento | Clínica (99178-2027) |
| Home, quem somos, eventos, equipe, trabalhe conosco, termos, política, 404 | Os três (são páginas da marca inteira) |

O tracking continua igual: `data-fa-footer="hub"` e `data-fa-link="rodape_hub"`, então os relatórios não quebram. Os links de navegação do rodapé (Clínica, Playground, Circuito) continuam em todas as páginas, porque não são telefone. `/aprender` e `/glossario` passaram a usar o WhatsApp da clínica no botão do topo e no flutuante, como os artigos já faziam (antes caíam no padrão Parque).
Conferido no HTML gerado: 0 ocorrência de 99178 nas páginas do Playground e do Circuito, e 0 de 99234/99110 nas páginas da clínica.
