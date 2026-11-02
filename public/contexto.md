# CONTEXTO DO PROJETO — FAÇAAMIGOS TV (VITRINE DIGITAL)

> **Documento de Contexto Estratégico, Cultura e Diretrizes Técnicas**  
> **Ecossistema:** Instituto FaçaAmigos (Playground Inclusivo, Circuito de Carrinhos e Clínica de Terapia Comportamental)  
> **Local de Operação:** Belém/PA — Parque Shopping Belém e Unidades de Atendimento  
> **Canal:** Telas e Smart TVs das Operações  
> **URL da Aplicação:** `https://institutofacaamigos.com.br/tv` (atalho `/tv` ou `/vitrine-digital`)

---

## 1. Visão Geral do Projeto

Cada operação do ecossistema FaçaAmigos (Playground Inclusivo, Circuito de Carrinhos e Clínica) conta com uma Smart TV dedicada instalada no quiosque ou salão.

O objetivo da **FaçaAmigos TV** é transformar essas telas em uma **Vitrine Digital Inteligente e Canal de Cultura Interna**, operando de forma 100% autônoma desde a abertura do shopping até o fechamento (10h às 22h), **sem exigir qualquer ação diária dos colaboradores**.

### Premissas Operacionais
1. **Zero Curva de Aprendizado para a Equipe:** O colaborador apenas abre o navegador da TV, digita a URL curta `/tv`, aciona a tela cheia (F11 ou toque duplo) e a página gerencia todo o ciclo de vida sozinha.
2. **Zero Scrollbar e 100% Responsivo a 16:9:** O layout é travado rigidamente em `100vw` e `100vh` (`overflow: hidden`), sem barras de rolagem ou elementos flutuantes indesejados. O design é otimizado para resoluções Full HD (1920x1080) e 4K.
3. **Leveza para Hardware de TV:** Navegadores de Smart TVs (Tizen/Samsung, webOS/LG, Android TV) possuem poder de processamento e GPU limitados. O projeto utiliza HTML, CSS puro com aceleração por hardware (`transform`, `opacity`) e Vanilla JavaScript leve, sem frameworks pesados, garantindo 60fps constantes sem vazamento de memória.
4. **Resiliência a Quedas de Conexão:** Após o primeiro carregamento, o ciclo de rotação é 100% autônomo localmente, funcionando mesmo se houver oscilação de Wi-Fi.

---

## 2. Cultura, Princípios de Atendimento e DNA FaçaAmigos

Toda a comunicação do FaçaAmigos TV reflete os pilares fundados pela psicóloga infantil **Dra. Isabella Gonçalves Freitas (CRP 10/4727)** e pela direção do Instituto:

### Os 4 Pilares da Cultura FaçaAmigos
1. **É para Todas as Crianças:**
   - Crianças típicas e atípicas (com autismo/TEA, TDAH, deficiências motoras, sensoriais ou sem nenhum diagnóstico) brincam e aprendem juntas no mesmo espaço.
   - *Inclusão não é separar nem criar um gueto; é desenhar um ambiente onde ninguém fique de fora.*
2. **Linguagem Humanizada e Não-Estigmatizante:**
   - **Usar:** "criança típica", "criança atípica", "necessidade de suporte", "brincar com propósito".
   - **Jamais usar:** "criança normal", "criança especial", "criança problemática" ou promessas milagrosas de "cura".
   - **Postura da Recepção:** Em vez de "ele tem algum problema?", a abordagem de excelência é: *"Tem algo que ajude a gente a cuidar melhor dele hoje?"*.
3. **O Brincar com Propósito:**
   - O brincar é o canal primário de desenvolvimento infantil, regulação emocional, socialização e formação de laços afetivos.
4. **Espaço Seguro e Regulação Sensorial:**
   - Iluminação agradável, opções de cantinho da calma / descompressão, mediadores treinados e acolhimento familiar sem julgamentos.

---

## 3. Arquitetura de Conteúdo: Ciclo Rotativo de 5 Dias & Exibição Randômica

Para que a experiência seja sempre fresca, interessante e nunca cansativa tanto para os colaboradores que passam o dia na loja quanto para as famílias que visitam o shopping com frequência, o sistema implementa um **Ciclo de 5 Dias com Randomização Inteligente**:

```
┌────────────────────────────────────────────────────────────────────────┐
│             CICLO DE 5 DIAS (NÃO REPETE EM MENOS DE 5 DIAS)            │
├─────────┬───────────────────────────────┬──────────────────────────────┤
│ DIA     │ 10h00 às 15h59 (EQUIPE)       │ 16h00 às 22h00 (FAMÍLIAS)    │
├─────────┼───────────────────────────────┼──────────────────────────────┤
│ Dia 1   │ Acolhimento & Presença Plena  │ O Reino das Mascotes         │
│ Dia 2   │ Empatia Sensorial & Calma     │ Aventura na Piscina Gigante  │
│ Dia 3   │ O Brincar como Conexão        │ Circuito & Frota Esportiva   │
│ Dia 4   │ Apoio às Famílias & Escuta    │ Inclusão Real & Diversão     │
│ Dia 5   │ Cooperação & Propósito Coletivo│ Clínica & Desenvolvimento    │
└─────────┴───────────────────────────────┴──────────────────────────────┘
```

### 3.1. Cálculo Automático do Dia do Ciclo
- O sistema obtém a data atual do fuso de Belém (UTC-3) e calcula o índice do dia: `(dias_desde_epoca % 5) + 1`.
- A cada novo dia civil, um novo conjunto completo de pílulas entra em cartaz.
- **Dessa forma, uma mensagem só se repete de 5 em 5 dias.**

### 3.2. Randomização (Shuffle)
- Dentro do pool do dia, a ordem de exibição é embaralhada randomicamente (algoritmo Fisher-Yates), evitando que a sequência seja monótona ou previsível durante as 6 horas de cada turno.

---

## 4. Os Dois Turnos de Exibição

### 4.1. Turno Manhã / Tarde (10h00 às 15h59) — Foco na Equipe & Acolhimento
* **Contexto do Shopping:** Baixo fluxo de clientes nos corredores. A equipe está na operação, arrumando o espaço e se preparando para o atendimento.
* **Abordagem:** Não é um manual de treinamento pesado nem texto didático longo. São **micro-pílulas de psicologia positiva, reflexão e comunicação empática**, transmitidas de forma sutil e acolhedora.
* **Os 5 Temas Diários da Equipe:**
  - **Dia 1 — Acolhimento & Presença Plena:** Olhar nos olhos, postura corporal aberta, a pergunta de ouro da recepção ("Tem algo que ajude a gente a cuidar melhor dele hoje?").
  - **Dia 2 — Empatia Sensorial & Calma:** Entender que a agitação é um pedido de pausa; usar o cantinho da calma; o tom de voz sereno que acalma o ambiente.
  - **Dia 3 — O Brincar como Conexão:** Estar na altura da criança; incentivo amoroso no chão; respeito ao tempo de cada uma; celebrar pequenas vitórias.
  - **Dia 4 — Apoio às Famílias & Escuta Ativa:** Compreensão com os pais que chegam cansados; escuta sem julgamento; acolher a família inteira como parceira.
  - **Dia 5 — Cooperação & Propósito:** Crianças típicas e atípicas aprendem juntas; o orgulho de construir memórias felizes na infância de alguém.

### 4.2. Turno Tarde / Noite (16h00 às 22h00) — Hora da Criança
* **Público:** a criança que já está dentro do salão. A tela deixou de ser vitrine (sem preço, clínica, laudo ou fotos das atrações; isso é papel da `/tv2` e do site). Ela fala com a criança para **fixar** (saber onde está e o que vem depois), **brincar** (convites ao corpo, sem vencedor) e **acolher** (respirar, descansar).
* **TV sem toque:** a criança responde com o corpo, guiada pela voz. Toda proposta de movimento tem versão sentada ou só com as mãos.
* **Personagens:** a cachorra golden **Zoe** (anfitriã, colete FaçaAmigos), o **Tuco** (tucano, música), o **Caco** (macaco, movimento) e a **Tati** (tartaruga, calma). Cada um aparece sempre como ele mesmo, nunca como outro bicho. 18 poses em `img/amigos/` (recortadas da folha do Drive; peça versões maiores e as poses "bravo" e "triste" quando houver).
* **Blocos de ~10 min:** `16h–19h` mais brincar; `19h–22h` mais pausa e acolher. Cada bloco: Oi, amigo! → cenas sorteadas por tipo → Pausa do rio → Respira com a Tati. A mesma cena nunca repete em sequência.
* **Cenas (`?cena=`):** `oi`, `cor`, `estatua`, `bicho`, `missao`, `ritmo`, `resp`, `pausa` (e as da equipe: `ir`, `calma`, `festa`). Abra `/tv?cena=estatua&dia=5` para ver uma cena em laço.
* **Tema do dia (ciclo de 5 dias):** 1 amigos da floresta, 2 amigos do rio, 3 cores, 4 calma, 5 música. O tema muda quais cenas e quais movimentos aparecem primeiro.
* **Som:** voz gravada (MP3 gerado no Gemini, em `audio/voz/<id>.mp3`; roteiro em `conteudo/tv-salao-roteiro-de-vozes.md`), trilha "caixinha de música" e som de água sintetizados na página. A lógica de volume por horário e compressor é a mesma da `/tv2`, copiada (a `/tv2` não foi alterada): 0,6 até 18h, 0,8 das 18h às 21h, 0,5 depois. Sem o arquivo de voz, a cena roda só com imagem e trilha.
* **Sem aviso de cookies:** como a `/tv2`, a página tem `<html data-fa-kiosk>`. O `fa-track.js` não abre o banner e libera só a medição (`analytics_storage`), sem anúncios nem Clarity. É uma TV da empresa, sem ninguém para responder ao aviso.
* **Primeira vez que a TV liga:** o navegador pode segurar o som até um clique ou tecla (aparece o aviso "Toque ou aperte uma tecla para ligar o som"). No Chrome em modo quiosque, a flag `--autoplay-policy=no-user-gesture-required` dispensa o clique. Tecla `S` liga e desliga o som; `?som=0|1` força.
* **Vinheta "Faça Amigos":** antes de cada dinâmica (Estátua, Imite o bicho e Ache a cor) a TV mostra "Vai começar!" com o Tuco e toca `audio/vinheta-dinamica.mp3` (~5 s, marimba com o ritmo de Fa-ça a-MI-gos e estalo de bolha de chiclete). Pausas, respiração e boas-vindas não têm vinheta. Gerada por `scripts/generate-vinheta.py` (numpy + ffmpeg). O aviso conta como parte da duração da dinâmica.
* **Cuidados sensoriais:** sem flash, nenhuma troca mais rápida que meio segundo, só `transform` e `opacity`, sem sirene ou buzina, voz calma e lenta.
* **Controle da equipe pelo celular (lote 2):** página `/tv-controle` (noindex, sem tracking) com 5 botões: Chamar para a dinâmica (vinheta + a próxima dinâmica, escolhida pelo tema do dia), Hora de ir (anel de 5 min, vozes ir-05 / ir-01 / ir-fim e a Zoe dando tchau), Hora da calma (tela baixa e água até voltar, no máximo 15 min), Festa (25 s com música) e Voltar ao automático. Fora do horário da criança (ex.: 11h) o comando abre a Hora da Criança só durante a cena e depois a TV volta ao horário. Comunicação: Supabase Realtime Broadcast, pelo cliente mínimo `assets/fa-realtime.js` (sem biblioteca, sem tabela, sem Edge Function). Cada TV tem um código de 8 letras e números: nasce na 1ª abertura, fica salvo na TV (localStorage `fa-tv-canal`), aparece por 90 s na 1ª vez e a qualquer momento com a tecla `C` (ou `/tv?canal=XXXXXXXX` para escolher o código). O celular digita o código uma vez e guarda. O canal é `tv-<código>`: quem não sabe o código não fala com a TV. A TV avisa o que está passando (a cada 15 s e a cada troca) e o celular mostra "TV conectada". Manual da equipe em imagem: `conteudo/manual-controle-celular.png`.
* **Missão FaçaAmigos** (30 s): uma missão de amizade por vez (acenar, perguntar o nome de um amigo novo, brincar junto na piscina de bolinhas), sempre "só se você quiser, do seu jeito", sem pedir toque. **Ritmo do carimbó** (90 s): bater palmas no compasso com o Tuco (devagar, mais rápido, devagar de novo; versão na perna, na mesa ou com as mãos no ar). Anéis pulsando no ritmo e batida sintetizada (tambor + palma), sem agudos duros. As duas têm a vinheta antes, e o tema do dia 5 (música e ritmo) põe o Ritmo na frente.
* **Ainda fora do lote:** Como você está? (faltam poses bravo e triste), Onde está o Tuco? e as historinhas.

### 4.3. Turno Noturno (22h00 às 09h59) — Stand-by Suave
* Tela escura relaxante para Smart TV (proteção de tela contra burn-in), relógio digital grande e aviso: *"Até amanhã! Abrimos às 10h00."*

---

## 5. Teclas de Atalho e Controles para Demonstração

Para facilitar testes, reuniões de equipe e demonstrações a investidores sem precisar esperar o horário real:

| Tecla / Ação | Função |
|---|---|
| **`1`** | Força o **Turno da Equipe (10h–16h)** |
| **`2`** | Força a **Hora da Criança (16h–22h)** |
| **`0`** ou **`A`** | Retorna ao **Modo Automático** por relógio |
| **`[` e `]`** | Alterna manualmente entre os **Dias 1 a 5 do Ciclo** |
| **`F`** ou Duplo Clique | Alterna modo **Tela Cheia (Fullscreen)** |
| **`C`** | Mostra o **código do controle** da equipe (celular) |
| **`S`** | Liga ou desliga o **som** (Hora da Criança) |
| **`G`** | Abre o **Mini-Game Interativo** (Roadmap) |

---

## 6. Inventário de Imagens Oficiais

| Imagem | Descrição |
|---|---|
| `img/circuito-equipe-capivara.webp` | A querida Capivara gigante do Circuito com a equipe |
| `img/circuito-macaco.webp` | A mascote Macaco gigante no Circuito |
| `img/hero-piscina-bolinhas.webp` | A enorme piscina de bolinhas do Playground |
| `img/playground-piscina-casinha.webp` | Vista panorâmica da casinha e do salão |
| `img/circuito-bombeiro.webp` | O caminhão de bombeiro elétrico |
| `img/circuito-frota-alinhada.webp` | Frota esportiva alinhada de carrinhos |
| `img/playground-mediadora-tapete.webp` | Mediadora de inclusão acolhendo no tapete |
| `img/equipe-recepcao.webp` | Equipe de recepção unida |
| `img/inclusao-cantinho-leitura.webp` | Canto de descompressão, calma e leitura |
| `img/galeria-oficinas.webp` | Oficinas criativas e integração infantil |
| `img/clinica-painel-sensorial.webp` | Painel sensorial do Centro de Terapia |
| `img/logo-simbolo.png` | Símbolo e ícone oficial da marca |
| `img/amigos/*.webp` | 18 poses dos personagens (Zoe, Tuco, Caco, Tati) usadas na Hora da Criança |

---

## 7. TV2 — Vitrine Digital do Quiosque do Circuito (`/tv2`)

O quiosque do Circuito de Carrinhos Elétricos conta com uma **TV de 50" deitada 90º (fica em pé, em retrato)**. Objetivo único: **fazer o pai/mãe que passa no corredor parar e alugar um carrinho.**

### 7.1. Características da TV2 (`tv2.html`):
- **Só Circuito:** apenas fotos reais dos carrinhos, caminhão de bombeiro, Lamborghini, Range Rover, jeep, moto e pelúcias motorizadas. Fotos de obra, playground ou clínica não entram.
- **Palco fixo 1080x1920 (retrato) girado e escalado:** se o sinal chega em paisagem, gira 90º horário automaticamente; funciona igual em TV 720p, 1080p ou 4K. Se a imagem ficar de cabeça para baixo, aperte `R` (90º → 270º → 0º → auto; a escolha fica salva na TV) ou abra `/tv2?giro=270`.
- **Inicia sozinha:** abre a URL, entra em tela cheia (F / duplo clique) e roda em loop; recarrega 1x por dia às 06h para puxar atualizações.
- **Preço em fundo claro, mínimo de texto:** `R$ 48,00` gigante + dois cartões `20 min · Pelúcias e jeep` e `30 min · Carrinhos`. O cartão do plano da foto da vez acende.
- **Copy persuasivo (doutrina do alívio emocional, ver posicionamento):** pressuposição ("Qual ele vai escolher hoje?"), comando embutido ("Escolhe. Senta. Acelera!"), futuro vivido ("Daqui a 30 minutos você vai ouvir: 'De novo!'"), alívio de quem cuida ("Você respira. Ele acelera."). **Nunca usar as palavras promessa, confiança e oferta**, nem "garantido"/"cura".
- **Medição por experimento:** cada troca de slide vai ao `dataLayer` (`tv2_slide`) com o rótulo `CONFIG.experiment`. A TV é passiva: o evento só registra o que estava na tela; a venda vem de `sessoes` do quiosque (somente leitura). Regras: uma mudança por vez, trocar o rótulo no mesmo deploy (`<o-que-mudou>-AAAA-MM`), mínimo de 2 semanas por versão, comparar mesmo dia da semana e faixa de horário, métrica = sessões vendidas por hora, por plano. O cruzamento é por data e hora, então mostra tendência, não prova causa. Linha de base: `base-2026-10`. Em curso: `fotos-novas-2026-10`. Registro semanal e ideias de testes em `EXPERIMENTOS-TV2.md`.
- **Sem aviso de cookies:** a página tem `<html data-fa-kiosk>`. O `fa-track.js` não abre o banner e libera só a medição (`analytics_storage`), sem anúncios nem Clarity. É uma TV da empresa: não há ninguém para responder ao aviso, e ele cobria os cartões de preço.
- **Atenção periférica:** brilho que atravessa o preço a cada 6s, pulso leve, palavras do mantra acendendo em sequência — tudo em `transform`/`opacity` (leve para TV).

## 8. Roadmap Futuro: Jogos Interativos na TV

Preparação para totens interativos e telas touch:
- Camada `#game-layer` já implementada e isolada.
- Mini-game experimental de estourar bolinhas sensoriais colorido já funcional (acionável via tecla `G` ou botão no HUD).
- Timeout de 30 segundos de inatividade para retorno automático à Vitrine Digital.
- Estrutura pronta para plugar futuros jogos: Memória dos Amigos, Labirinto dos Bichos, Circuito Piloto.

