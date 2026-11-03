# TV3 · Roteiro dos 42 slides (copy final)

Documento para a Isabella e para o dono do negócio. O texto de cada slide está exatamente como vai à tela (o `<em>` marca o trecho em destaque; `{{...}}` são trocados pelo motor da TV). Slides com **[ISABELLA]** precisam de revisão clínica antes de ir ao ar.

## Como a volta funciona e o que ficou de fora

**Ritmo.** Os tempos `dur` abaixo são os do roteiro. A TV multiplica todos por `CONFIG.ritmo` (hoje 1,25: um slide de 15 s fica 18,75 s na tela e a volta de ~11,9 min dura ~14,9 min). Para mais devagar ou mais depressa, mude só esse número no `tv3.html`.

1. A volta tem cerca de 10 a 11 minutos e mostra cada slide uma vez; `a_lembrete` aparece duas vezes. Em 2 a 3 horas de espera o pai vê a volta umas 12 a 18 vezes, por isso o miolo é variado e as dicas e respiros trocam a cada dia do ciclo de 5 dias.
2. Abre sempre em `b_boasvindas` (acolhe, diz que dia é e dá permissão para descansar) e fecha sempre em `a_fecho` (compromisso: da próxima vez que o QR aparecer, eu aponto a câmera).
3. O QR do Portal aparece no máximo a cada 6 minutos. `a_dor22h` e `a_tut` andam juntos: primeiro a cena que o pai reconhece, depois o passo a passo.
4. Antes de cada pedido do Portal entra uma dica (família C). O valor vem antes do pedido, e a dica funciona mesmo sem escanear nada.
5. Técnicas visíveis na estrutura: pacing e leading (descreve o agora e conduz), pressuposição e comando embutido ("Quando você entrar...", aponte, toque, digite), futuro vivido ("Na próxima sessão..."), prova por especificidade (25 MB, 15 minutos, 5 minutos, Conferido) e autoridade por transparência (mostra como funciona).
6. Todo texto promete processo (o que acontece, quando e por quem), nunca resultado clínico. Nenhum slide soma culpa, usa medo, escassez ou urgência.
7. O QR do Portal leva a `/familia`, onde está o botão Entrar. A tela de login abre na aba Equipe, por isso todo slide com QR do Portal manda tocar em Família.
8. Cada afirmação factual tem fonte `arquivo:linha` na lista "Fatos usados". Onde não achei fonte, o fato não foi escrito.

**Fica de fora de propósito:** convênios; número de clínica ou "já atendemos" para a clínica (ela abre em dezembro/2026); depoimentos; progresso clínico, percentual ou "tempo real"; aviso ao pai quando a coordenação responde; remarcação automática por WhatsApp (ver divergência em `a_falta`); recibo, declaração, boleto e financeiro; confirmar presença; tarefas de casa; foto da criança no mural da recepção; o nome "Mural da Família"; café, senha e "alta velocidade" de Wi-Fi; superlativos; desconto com valor (o benefício vem de `{{beneficio}}`).

**Legenda das fontes:** `LP` = este repositório (langing_page_faca_amigos) · `CF` = repositório clinica_facaamigos (código do Portal) · `PLANO` = PLANO-TV3.md · `briefing do pedido` = instruções desta tarefa (dados de NPS e sessões, endereços, texto de benefício).

**Famílias:** A: 12, B: 9, C: 8, D: 7, E: 2, R: 4 · total 42 slides · 600 s somados (sem repetir `a_lembrete`).


---

## A. Portal da Família

### `a_dor22h` **[ISABELLA]**
Família A · 15 s · sem QR, layout padrao, unidade arcoA pos 0
- **Intenção:** Pacing: descreve a cena noturna que o pai reconhece, e conduz para o portal como lugar onde ficam metas e orientações. Alívio, sem culpa.
- **Imagem:** `img/clinica-recursos-terapeuticos.webp` (alternativas: `img/clinica-painel-sensorial.webp`, `img/clinica-atividade-pedagogica.webp`)
- **Texto na tela:**
  - Kicker: 🌙 Quando a casa fica quieta
  - Headline: A dúvida da sessão chega às <em>22h</em>.
  - Subtexto: A casa quieta, a criança dormindo e a sua cabeça ainda na sessão. As metas do plano e as orientações da equipe ficam no portal, para você rever quando quiser.
- **Fatos usados:**
  - Cena de quem pesquisa até tarde: LP/guia.html:570
  - Metas do plano aparecem quando a equipe clínica aprova o plano: CF/app/familia/page.tsx:693-696, 740-741
  - Orientações da equipe ficam no portal: CF/app/familia/page.tsx:749-765

### `a_tut`
Família A · 20 s · QR: portal, layout tutorial, unidade arcoA pos 1
- **Intenção:** Pacing (a sessão está acontecendo agora) + comando embutido (entre, aponte, toque, digite) + pressuposição (Quando você entrar). Especificidade: 6 números, 5 minutos, CPF só na 1ª vez.
- **Imagem:** `img/clinica-fachada.webp` (alternativas: `img/clinica-atividade-pedagogica.webp`, `img/clinica-painel-sensorial.webp`)
- **Texto na tela:**
  - Kicker: 📱 Portal da Família
  - Headline: Enquanto a sessão acontece, <em>entre no portal</em>.
  - Subtexto: Quando você entrar, a agenda, os documentos e os recados da coordenação ficam no seu celular. São três passos.
  - Título do QR: Aponte a câmera aqui
  - Texto do QR: Leia o código com a câmera e toque em Entrar no portal.
  - Dica sob o QR: Na tela de entrada, toque em Família
  - Passo 1: **Aponte e toque em Família** · Leia o QR, toque em Entrar e depois na aba Família.
  - Passo 2: **Digite o celular cadastrado** · É o número que você informou à recepção.
  - Passo 3: **Digite o código do SMS** · 6 números, valem 5 minutos. CPF só no primeiro acesso.
- **Fatos usados:**
  - QR leva a /familia, que tem o botão Entrar no portal: decisão do plano (QR aponta para /familia); LP/familia.html:113
  - Tela de entrada abre na aba Equipe; aba Família é a do responsável: CF/app/login/login-form.tsx:15, 102, 115
  - Login por telefone (SMS) e código de 6 dígitos: CF/app/login/login-form.tsx:184, 222; CF/app/login/otp-actions.ts:79
  - Código expira em 5 minutos: CF/app/login/otp-actions.ts:81, 105; LP/familia.html:127
  - CPF só no primeiro acesso: CF/app/login/login-form.tsx:241-258; LP/familia.html:127
  - Celular é o informado à recepção: LP/familia.html:123
  - Agenda, documentos e recados da coordenação: LP/familia.html:108, 135-142

### `a_lembrete`
Família A · 10 s · QR: portal, layout padrao, peso 2 (2x por volta)
- **Intenção:** Lembrete de 10 s: só QR, comando direto e a saída para quem ainda não tem o celular cadastrado.
- **Imagem:** `img/clinica-painel-sensorial.webp`
- **Texto na tela:**
  - Kicker: 📱 Portal da Família
  - Headline: Aponte a câmera e <em>entre no portal</em>.
  - Subtexto: Leia o QR, toque em Entrar e depois na aba Família.
  - Selo: Portal da Família
  - Título da ação: Seu celular, o portal
  - Descrição da ação: Agenda, documentos e recados da coordenação no mesmo lugar.
  - Título do QR: Aponte a câmera aqui
  - Texto do QR: Leia o código, toque em Entrar no portal e depois na aba Família.
  - Dica sob o QR: Na tela de entrada, toque em Família
  - Ícone do destaque: 📞
  - Destaque: Celular ainda não cadastrado? Fale com a recepção.
- **Fatos usados:**
  - Fluxo de entrada: LP/familia.html:113-127
  - Celular não cadastrado: falar com a recepção: LP/familia.html:133
  - Conteúdo do portal: LP/familia.html:108, 135-142

### `a_mock`
Família A · 15 s · QR: portal, layout padrao, com mock do portal
- **Intenção:** Reconhecimento visual: quem já viu a tela no celular sabe que chegou ao lugar certo e não desiste na aba Equipe.
- **Imagem:** `img/clinica-fachada.webp`
- **Texto na tela:**
  - Kicker: 👀 Você vai reconhecer
  - Headline: É <em>esta tela</em> que abre no seu celular.
  - Subtexto: Rosa e petróleo no topo, com FaçaAmigos · Família e, logo abaixo, a próxima sessão do seu filho.
  - Selo: Portal da Família
  - Título da ação: A próxima sessão no topo
  - Descrição da ação: Dia, hora e terapeuta logo ao abrir, com os botões de falta e remarcação ao lado.
  - Título do QR: Abra no seu celular
  - Texto do QR: Leia o código, toque em Entrar no portal e depois na aba Família.
  - Dica sob o QR: Na tela de entrada, toque em Família
  - Ícone do destaque: 💛
  - Destaque: A saudação da primeira tela usa o nome do seu filho.
- **Fatos usados:**
  - Cabeçalho em degradê rosa, petróleo e escuro, com FaçaAmigos · Família: CF/app/familia/page.tsx:433-446
  - Saudação com o nome da criança: CF/app/familia/page.tsx:426-429 (cai em 'seu filho(a)' se o nome não existir)
  - Próxima sessão com dia, hora e terapeuta: CF/app/familia/page.tsx:496-512
  - Botões Informar falta e Pedir remarcação na próxima sessão: CF/app/familia/page.tsx:516-526

### `a_agenda`
Família A · 15 s · QR: portal, layout padrao
- **Intenção:** Benefício concreto e diário (agenda); futuro vivido (combinar a semana). Promessa de processo: onde a informação fica.
- **Imagem:** `img/clinica-atividade-pedagogica.webp` (alternativas: `img/clinica-recursos-terapeuticos.webp`, `img/clinica-fachada.webp`)
- **Texto na tela:**
  - Kicker: 🗓️ Agenda no celular
  - Headline: A próxima sessão <em>já está lá</em> quando você abre.
  - Subtexto: Cada sessão agendada mostra dia, hora e terapeuta. Abaixo, a frequência do mês: sessões realizadas e faltas.
  - Selo: Portal da Família
  - Título da ação: Agenda e frequência do mês
  - Descrição da ação: Próximas sessões com dia, hora e terapeuta, e a contagem do mês.
  - Título do QR: Veja a sua agenda
  - Texto do QR: Leia o código, toque em Entrar no portal e depois na aba Família.
  - Dica sob o QR: Na tela de entrada, toque em Família
  - Ícone do destaque: 🗓️
  - Destaque: Na hora de combinar a semana, o horário já está na tela.
- **Fatos usados:**
  - Agenda e Próximas Sessões com dia, hora e terapeuta: CF/app/familia/page.tsx:570-610
  - Frequência do mês (sessões realizadas e faltas): CF/app/familia/page.tsx:663-678

### `a_falta`
Família A · 15 s · QR: portal, layout padrao
- **Intenção:** Remove atrito de um momento chato (faltar). Comando embutido (avise, anexe, toque). Sem prometer que a sessão será remarcada.
- **Imagem:** `img/clinica-fachada.webp` (alternativas: `img/clinica-painel-sensorial.webp`, `img/clinica-recursos-terapeuticos.webp`)
- **Texto na tela:**
  - Kicker: 📝 Falta e remarcação
  - Headline: Se não puder vir, <em>avise pelo portal</em>.
  - Subtexto: Escolha o motivo e anexe o atestado em PDF, JPG ou PNG. Para pedir outro horário, toque em Pedir remarcação.
  - Selo: Portal da Família
  - Título da ação: Avisar falta e pedir remarcação
  - Descrição da ação: Os dois botões ficam na próxima sessão, no topo do portal.
  - Título do QR: Aponte a câmera aqui
  - Texto do QR: Leia o código, toque em Entrar no portal e depois na aba Família.
  - Dica sob o QR: Na tela de entrada, toque em Família
  - Ícone do destaque: 📎
  - Destaque: O aviso fica registrado na própria sessão, com o atestado anexo.
- **Fatos usados:**
  - Motivo da ausência e anexo de atestado em PDF, JPG, PNG: CF/app/familia/report-absence.tsx:179
  - Aviso gravado ligado à sessão, com o anexo: CF/app/familia/actions.ts:336-345; CF/app/familia/page.tsx:600
  - Botão Pedir remarcação: CF/app/familia/request-reschedule.tsx:45; CF/app/familia/page.tsx:521
  - DIVERGÊNCIA do briefing: o WhatsApp enviado após a falta diz apenas que a clínica sente a ausência (CF/lib/twilio-absence-bot.ts:24); por isso o slide NÃO diz que a remarcação chega por WhatsApp

### `a_docs`
Família A · 15 s · QR: portal, layout padrao
- **Intenção:** Prova por especificidade (25 MB, status Conferido). Transparência de processo: você vê em que etapa está o seu envio.
- **Imagem:** `img/clinica-recursos-terapeuticos.webp` (alternativas: `img/clinica-atividade-pedagogica.webp`, `img/clinica-painel-sensorial.webp`)
- **Texto na tela:**
  - Kicker: 📄 Documentos pelo celular
  - Headline: Carteirinha ou laudo? <em>Envie por foto</em>.
  - Subtexto: Fotografe ou anexe o PDF, até 25 MB. Quando a equipe revisar, o envio ganha o status Conferido.
  - Selo: Portal da Família
  - Título da ação: Enviar documento
  - Descrição da ação: Carteirinha do plano, pedido médico ou laudo, em foto ou PDF de até 25 MB.
  - Título do QR: Aponte a câmera aqui
  - Texto do QR: Leia o código, toque em Entrar no portal e depois na aba Família.
  - Dica sob o QR: Na tela de entrada, toque em Família
  - Ícone do destaque: ✅
  - Destaque: Cada envio mostra o status: Aguardando revisão ou Conferido.
- **Fatos usados:**
  - Limite de 25 MB: CF/app/familia/actions.ts:20, 507-508
  - Foto ou PDF: CF/app/familia/upload-document.tsx:116, 128
  - Carteirinha, pedido médico ou laudo: CF/app/familia/page.tsx:975
  - Status Conferido / Aguardando revisão: CF/app/familia/page.tsx:967

### `a_baixar`
Família A · 15 s · QR: portal, layout padrao
- **Intenção:** Autoridade por transparência: mostra como a proteção funciona (link de 15 min, registro de acesso). Benefício: o documento na hora que a escola ou o médico pedir.
- **Imagem:** `img/clinica-painel-sensorial.webp` (alternativas: `img/clinica-fachada.webp`, `img/clinica-atividade-pedagogica.webp`)
- **Texto na tela:**
  - Kicker: ⬇️ Documentos liberados
  - Headline: Documentos liberados pela equipe, <em>para baixar</em>.
  - Subtexto: Relatórios, laudos e guias liberados aparecem no portal. O link de download vale 15 minutos e cada acesso fica registrado.
  - Selo: Portal da Família
  - Título da ação: Baixar quando precisar
  - Descrição da ação: Toque em Abrir ao lado do documento. Se o link vencer, toque de novo.
  - Título do QR: Aponte a câmera aqui
  - Texto do QR: Leia o código, toque em Entrar no portal e depois na aba Família.
  - Dica sob o QR: Na tela de entrada, toque em Família
  - Ícone do destaque: 🔒
  - Destaque: O acesso fica registrado para proteger os dados do seu filho.
- **Fatos usados:**
  - Área Documentos liberados e mensagem de liberação pela equipe: CF/app/familia/page.tsx:897-929
  - Link vale 900 segundos (15 minutos): CF/app/familia/actions.ts:18, 725
  - Registro de acesso (audit_log, ação download): CF/app/familia/actions.ts:734-737
  - Botão Abrir gera um novo link a cada toque, então o link vencido se resolve tocando de novo: CF/app/familia/document-open-button.tsx:19-27, 31

### `a_metas` **[ISABELLA]**
Família A · 15 s · QR: portal, layout padrao
- **Intenção:** Transparência do plano. Futuro vivido (a conversa com a terapeuta). Sem percentual, sem progresso, sem prazo.
- **Imagem:** `img/clinica-atividade-pedagogica.webp` (alternativas: `img/clinica-recursos-terapeuticos.webp`, `img/clinica-painel-sensorial.webp`)
- **Texto na tela:**
  - Kicker: 🎯 Metas do plano
  - Headline: As metas do plano ficam <em>no seu celular</em>.
  - Subtexto: Quando a equipe clínica aprova o plano terapêutico, as metas aparecem no portal. Cada uma mostra se está Ativa ou Atingida.
  - Selo: Portal da Família
  - Título da ação: Metas ativas e atingidas
  - Descrição da ação: A lista do plano terapêutico, em linguagem simples, sempre à mão.
  - Título do QR: Aponte a câmera aqui
  - Texto do QR: Leia o código, toque em Entrar no portal e depois na aba Família.
  - Dica sob o QR: Na tela de entrada, toque em Família
  - Ícone do destaque: 🌟
  - Destaque: Na conversa com a terapeuta, você já sabe o que está no plano.
- **Fatos usados:**
  - Seção de metas, com aviso 'as metas vão aparecer aqui' quando o plano é aprovado: CF/app/familia/page.tsx:693-741
  - Status Ativa e Atingida: CF/lib/appointment-status-style.ts:19-23
  - [ISABELLA] confirmar que 'linguagem simples' descreve o texto das metas que a equipe escreve (PRODUCT.md: 'metas em linguagem simples', CF/PRODUCT.md:22)

### `a_coord`
Família A · 15 s · QR: portal, layout padrao
- **Intenção:** Alívio: escrever no seu tempo, sem prender o dia no telefone. Fala do registro, nunca de aviso ao pai.
- **Imagem:** `img/clinica-painel-sensorial.webp` (alternativas: `img/clinica-fachada.webp`, `img/clinica-recursos-terapeuticos.webp`)
- **Texto na tela:**
  - Kicker: 💬 Fale com a Coordenação
  - Headline: Dúvida para a coordenação? <em>Escreva no portal</em>.
  - Subtexto: Toque em Fale com a Coordenação e envie a sua mensagem. A resposta fica registrada no portal, com o selo Resposta Recebida.
  - Selo: Portal da Família
  - Título da ação: Um recado, um registro
  - Descrição da ação: Você escreve quando puder e relê a conversa quando precisar.
  - Título do QR: Aponte a câmera aqui
  - Texto do QR: Leia o código, toque em Entrar no portal e depois na aba Família.
  - Dica sob o QR: Na tela de entrada, toque em Família
  - Ícone do destaque: 🗂️
  - Destaque: Mensagens e respostas ficam juntas, na mesma tela.
- **Fatos usados:**
  - Botão Fale com a Coordenação: CF/app/familia/contact-coordination.tsx:91, 97
  - Seção Mensagens e Respostas da Coordenação e selo Resposta Recebida: CF/app/familia/page.tsx:821-825, 840
  - Mensagens e respostas na mesma lista: CF/app/familia/page.tsx:830-890
  - ATENÇÃO: contact-coordination.tsx:101-102 diz que a coordenação responde 'por aqui ou por telefone'; por isso o slide diz 'a resposta fica registrada' só para o que é respondido pelo portal e não promete canal

### `a_vs_whats`
Família A · 15 s · sem QR, layout padrao
- **Intenção:** Reduz resistência ao novo canal sem depreciar o antigo. Tom neutro: cada canal tem a sua função.
- **Imagem:** `img/clinica-fachada.webp` (alternativas: `img/clinica-atividade-pedagogica.webp`, `img/clinica-recursos-terapeuticos.webp`)
- **Texto na tela:**
  - Kicker: 🤝 Dois canais
  - Headline: Dois canais, <em>cada um no seu papel</em>.
  - Subtexto: O WhatsApp segue como canal oficial da clínica. O portal junta o que você vai querer achar depois.
  - Coluna esquerda, WhatsApp oficial: Urgências do dia · Conversa rápida com a recepção · Dúvida de horário e endereço
  - Coluna direita, Portal da Família: Agenda e frequência do mês · Documentos enviados e liberados · Histórico de recados e respostas
- **Fatos usados:**
  - WhatsApp oficial (91) 99178-2027: LP/clinica.html:244
  - WhatsApp responde dúvidas de horário e endereço (FAQ do robô e da recepção): CF/chatbot-base-conhecimento.md:99-145
  - Agenda e frequência: CF/app/familia/page.tsx:570-610, 663-678
  - Documentos enviados e liberados: CF/app/familia/page.tsx:897-975
  - Histórico de recados e respostas: CF/app/familia/page.tsx:821-890

### `a_fecho`
Família A · 15 s · QR: portal, layout padrao, tag fechamento
- **Intenção:** Fechamento da volta. Intenção de implementação (quando o QR aparecer de novo, eu aponto) + futuro vivido (próxima sessão).
- **Imagem:** `img/clinica-atividade-pedagogica.webp` (alternativas: `img/clinica-fachada.webp`, `img/clinica-painel-sensorial.webp`)
- **Texto na tela:**
  - Kicker: 📱 Antes de ir embora
  - Headline: Antes de a sessão acabar, <em>você já entrou</em>.
  - Subtexto: Combine com você mesmo. Da próxima vez que este QR aparecer, você aponta a câmera. Na próxima sessão, a agenda e os recados já estarão no seu celular.
  - Selo: Portal da Família
  - Título da ação: Entre agora, com calma
  - Descrição da ação: São três passos. Ao abrir, a próxima sessão do seu filho aparece no topo.
  - Título do QR: Aponte a câmera aqui
  - Texto do QR: Leia o código, toque em Entrar no portal e depois na aba Família.
  - Dica sob o QR: Na tela de entrada, toque em Família
  - Ícone do destaque: 🤝
  - Destaque: A recepção ajuda com o cadastro do celular, se precisar.
- **Fatos usados:**
  - Três passos de entrada: LP/familia.html:115-130
  - Próxima sessão no topo: CF/app/familia/page.tsx:496-512
  - Agenda e recados no portal: LP/familia.html:135-142
  - Recepção ajuda com celular não cadastrado: LP/familia.html:133


---

## B. Clínica: transparência e acolhimento

### `b_boasvindas`
Família B · 15 s · sem QR, layout padrao, tag abertura
- **Intenção:** Abertura da volta: acolhe, orienta (onde está e que dia é) e dá permissão para descansar. Sem duração de sessão, que varia por terapia.
- **Imagem:** `img/clinica-fachada.webp` (alternativas: `img/clinica-painel-sensorial.webp`, `img/clinica-atividade-pedagogica.webp`)
- **Texto na tela:**
  - Kicker: 💛 Sala de espera
  - Headline: {{saudacao}}. Hoje é <em>{{diaSemana}}</em>.
  - Subtexto: Enquanto a sessão acontece, esta sala é sua: sente, respire e use o tempo como quiser. Quem cuida também precisa de pausa.
- **Fatos usados:**
  - Saudação e dia da semana: tokens trocados pelo motor (hora de Belém)
  - Duração da sessão fora do slide de propósito: o FAQ do sistema dá 40 min para a maioria e 30 min para psicologia (CF/chatbot-base-conhecimento.md:50, 78)

### `b_sessao40` **[ISABELLA]**
Família B · 15 s · sem QR, layout padrao
- **Intenção:** Transparência do que acontece lá dentro (autoridade por processo), em linguagem sensorial e sem prognóstico.
- **Imagem:** `img/clinica-atividade-pedagogica.webp` (alternativas: `img/clinica-recursos-terapeuticos.webp`, `img/clinica-painel-sensorial.webp`)
- **Texto na tela:**
  - Kicker: 🧩 Dentro da sessão
  - Headline: Na sessão, a terapia se parece com <em>brincar</em>.
  - Subtexto: Cada brincadeira tem um propósito, como esperar a vez ou ampliar a comunicação, sempre no ritmo da criança. O que deu certo é reconhecido.
- **Fatos usados:**
  - Uma boa sessão se parece muito com brincar; cada brincadeira tem um propósito (esperar a vez, ampliar a comunicação), no ritmo da criança; reforço positivo = reconhecer o que deu certo: LP/aprender/como-e-a-terapia-comportamental.html:212
  - Duração omitida de propósito (varia por terapia)

### `b_metodo` **[ISABELLA]**
Família B · 15 s · sem QR, layout padrao
- **Intenção:** Mostra a composição da equipe como fato verificável, sem adjetivo e sem resultado.
- **Imagem:** `img/clinica-recursos-terapeuticos.webp` (alternativas: `img/clinica-atividade-pedagogica.webp`, `img/clinica-painel-sensorial.webp`)
- **Texto na tela:**
  - Kicker: 🧠 Como a clínica trabalha
  - Headline: Uma equipe, <em>um plano só</em>.
  - Subtexto: Terapia comportamental apoiada em ABA, Fonoaudiologia, Terapia Ocupacional, Psicopedagogia e orientação a pais e escola.
- **Fatos usados:**
  - Uma equipe, um plano só: LP/clinica.html:419
  - Psicologia e terapia comportamental, apoiada em Análise do Comportamento Aplicada (ABA): LP/clinica.html:434-437, 270
  - Fonoaudiologia: LP/clinica.html:443; Terapia Ocupacional: 452; Psicopedagogia: 461; Orientação a pais e escola: 479

### `b_quemcuida`
Família B · 15 s · sem QR, layout padrao
- **Intenção:** Autoridade pessoal verificável (nome e registro profissional). Sem 'Direção Clínica', sem adjetivo.
- **Imagem:** `img/isabella-2.webp` (alternativas: `img/isabella-3.webp`)
- **Texto na tela:**
  - Kicker: 🌱 Quem idealizou a clínica
  - Headline: Isabella Gonçalves Freitas, <em>psicóloga infantil</em>
  - Subtexto: CRP 10/4727. Idealizadora do FaçaAmigos, conduz a clínica e escreve os textos de Aprender, no nosso site.
- **Fatos usados:**
  - Isabella Gonçalves Freitas, psicóloga infantil, CRP 10/4727: LP/clinica.html:253-255, 628
  - Idealizadora e fundadora do FaçaAmigos: LP/guia.html:723-725
  - Clínica conduzida por ela: LP/clinica.html:357
  - Textos de Aprender escritos pela idealizadora: LP/aprender/rotina-visual-em-casa.html:252
  - Sugestão: Isabella aprovar o próprio texto e a foto

### `b_orientacao_casa` **[ISABELLA]**
Família B · 15 s · sem QR, layout padrao
- **Intenção:** Mostra o que a família recebe, quando e por quem. Promessa de processo, nunca de resultado.
- **Imagem:** `img/clinica-painel-sensorial.webp` (alternativas: `img/clinica-atividade-pedagogica.webp`, `img/clinica-fachada.webp`)
- **Texto na tela:**
  - Kicker: 🏠 Para levar para casa
  - Headline: A orientação da sessão fica <em>no portal</em>.
  - Subtexto: A equipe marca o tema de cada orientação: Rotina, Comunicação, Alimentação, Sono ou Escola. Você vê no portal, com a data.
- **Fatos usados:**
  - Temas Rotina, Comunicação, Alimentação, Sono, Escola: CF/lib/session-note-fields.ts:27-34
  - Seção Orientações da equipe, com data: CF/app/familia/page.tsx:749-765
  - Orientação a pais faz parte do acompanhamento: LP/aprender/como-e-a-terapia-comportamental.html:215

### `b_escola` **[ISABELLA]**
Família B · 15 s · sem QR, layout padrao
- **Intenção:** Reduz o peso de quem cuida (a reunião escolar). Oferece apoio, sem pressionar.
- **Imagem:** `img/clinica-atividade-pedagogica.webp` (alternativas: `img/clinica-recursos-terapeuticos.webp`, `img/clinica-fachada.webp`)
- **Texto na tela:**
  - Kicker: 🏫 Escola e família
  - Headline: A escola também pode <em>entrar na conversa</em>.
  - Subtexto: Quando fizer sentido para a família, a clínica apoia o diálogo com a coordenação pedagógica. Ninguém vai sozinho à reunião.
- **Fatos usados:**
  - Orientação à escola, 'quando fizer sentido', e apoio na conversa com a coordenação pedagógica: LP/clinica.html:481-483
  - 'Você não sai sozinha da reunião com a escola' (adaptado para 'Ninguém vai sozinho', pois a TV fala com pais e mães): LP/clinica.html:483

### `b_espera` **[ISABELLA]**
Família B · 15 s · sem QR, layout padrao
- **Intenção:** Reconhece o cansaço de quem espera (pacing) e dá permissão. Sem atribuir função terapêutica à espera.
- **Imagem:** `img/clinica-painel-sensorial.webp` (alternativas: `img/clinica-fachada.webp`, `img/clinica-atividade-pedagogica.webp`)
- **Texto na tela:**
  - Kicker: 🫶 Para quem espera
  - Headline: Esperar também cansa. <em>Pode descansar.</em>
  - Subtexto: Respirar, olhar o celular ou ficar em silêncio, tudo vale. O seu descanso também importa.
- **Fatos usados:**
  - Compreensão com os pais que chegam cansados, acolhimento sem julgamento: LP/contexto.md:40, 81
  - 'O seu descanso é parte do método, não um luxo' (autocuidado de quem cuida): LP/guia.html:628
  - Sem fato clínico; texto de reconhecimento emocional

### `b_wifi`
Família B · 10 s · sem QR, layout padrao, só com wifiSsid
- **Intenção:** Serviço prático que também aproxima o pai do portal. Sem senha e sem adjetivo.
- **Imagem:** `img/clinica-fachada.webp`
- **Texto na tela:**
  - Kicker: 📶 Wi-Fi para visitantes
  - Headline: Conecte à rede <em>{{wifiSsid}}</em>.
  - Subtexto: Depois de conectar, faça o cadastro rápido que abre no celular. Em seguida, o portal fica a um toque.
- **Fatos usados:**
  - Rede de visitantes e cadastro rápido como gate de acesso: LP/hotspot/login.html:164-165, 217, 234
  - Wi-Fi da clínica ligado ao cadastro: LP/wifi.html:10
  - Nome da rede vem de CONFIG.wifiSsid (slide só aparece se preenchido)

### `b_horario`
Família B · 10 s · sem QR, layout padrao
- **Intenção:** Informação útil e estável; ancora o WhatsApp oficial como canal de urgência.
- **Imagem:** `img/clinica-fachada.webp`
- **Texto na tela:**
  - Kicker: 🕗 Horário da clínica
  - Headline: Atendimento de <em>segunda a sábado</em>.
  - Subtexto: Segunda a sexta, das 8h às 18h. Sábado, das 8h às 12h. WhatsApp oficial: (91) 99178-2027.
- **Fatos usados:**
  - Segunda a sexta 8h-18h; sábado 8h-12h: LP/clinica.html:246-248
  - WhatsApp (91) 99178-2027: LP/clinica.html:244


---

## C. Psicoeducação

### `c_rotina` **[ISABELLA]**
Família C · 15 s · QR: aprender:rotina, layout padrao, dias 1,3,5
- **Intenção:** Valor antes do pedido: a dica funciona sem QR; o QR só aprofunda. Reciprocidade.
- **Imagem:** `img/clinica-recursos-terapeuticos.webp` (alternativas: `img/clinica-atividade-pedagogica.webp`, `img/clinica-painel-sensorial.webp`)
- **Texto na tela:**
  - Kicker: 🖼️ Dica para hoje
  - Headline: Um momento do dia, <em>de 4 a 6 passos</em>.
  - Subtexto: Para começar uma rotina visual, escolha só um momento, como a manhã ou a hora de dormir. Liste os passos na ordem real da sua casa.
  - Selo: Aprender
  - Título da ação: Rotina visual em 20 minutos
  - Descrição da ação: Passo a passo para montar em casa, com ícones colados na altura da criança.
  - Título do QR: Leia o passo a passo
  - Texto do QR: Aponte a câmera e abra o texto no seu celular.
  - Dica sob o QR: Texto escrito pela Isabella
  - Ícone do destaque: 🖼️
  - Destaque: Ao terminar cada passo, deixe a criança marcar o ícone.
- **Fatos usados:**
  - Escolha só um momento (manhã ou hora de dormir); liste de 4 a 6 passos na ordem real da casa; cole numa altura que a criança alcance: LP/aprender/rotina-visual-em-casa.html:213-216
  - Passo a passo de 20 minutos: LP/aprender/rotina-visual-em-casa.html:200, 211
  - Deixar a criança marcar o ícone ao terminar cada passo: LP/aprender/rotina-visual-em-casa.html:220
  - Escrito pela idealizadora: LP/aprender/rotina-visual-em-casa.html:252

### `c_transicao` **[ISABELLA]**
Família C · 15 s · QR: aprender:rotina, layout padrao, dias 2,4,5
- **Intenção:** Dica acionável de uso imediato (avisar o próximo passo), com QR para quem quiser o método completo.
- **Imagem:** `img/clinica-atividade-pedagogica.webp` (alternativas: `img/clinica-painel-sensorial.webp`, `img/clinica-fachada.webp`)
- **Texto na tela:**
  - Kicker: 🔔 Dica para hoje
  - Headline: Avise o que vem <em>depois do banho</em>.
  - Subtexto: Para muitas crianças, trocar de atividade é o momento mais difícil do dia. Saber o próximo passo antes poupa a energia que ele gastaria tentando adivinhar.
  - Selo: Aprender
  - Título da ação: Rotina visual em casa
  - Descrição da ação: Como deixar o próximo passo previsível, com um passo a passo de 20 minutos.
  - Título do QR: Leia o passo a passo
  - Texto do QR: Aponte a câmera e abra o texto no seu celular.
  - Dica sob o QR: Texto escrito pela Isabella
  - Ícone do destaque: 🗓️
  - Destaque: Antecipar o próximo passo deixa a transição mais previsível.
- **Fatos usados:**
  - Para muitas crianças a transição é o momento mais difícil; rotina visual deixa o próximo passo previsível: LP/aprender/rotina-visual-em-casa.html:206
  - Quando a criança sabe o que vem depois do banho, gasta menos energia tentando adivinhar: LP/aprender/rotina-visual-em-casa.html:209

### `c_calma` **[ISABELLA]**
Família C · 15 s · QR: aprender:crise, layout padrao, dias 1,2,4
- **Intenção:** Dica acionável para um momento de pico de angústia; alívio de quem cuida. Valor antes do QR.
- **Imagem:** `img/clinica-painel-sensorial.webp` (alternativas: `img/clinica-fachada.webp`, `img/clinica-recursos-terapeuticos.webp`)
- **Texto na tela:**
  - Kicker: 🌿 Dica para hoje
  - Headline: Na crise, baixe <em>luz, som e gente</em>.
  - Subtexto: Se for crise, reduza o estímulo ao redor e fique por perto, sem exigir explicação. A conversa vem depois.
  - Selo: Aprender
  - Título da ação: Birra ou crise: como diferenciar
  - Descrição da ação: Três sinais para observar na hora e o que fazer em cada caso.
  - Título do QR: Leia o texto completo
  - Texto do QR: Aponte a câmera e abra o texto no seu celular.
  - Dica sob o QR: Texto escrito pela Isabella
  - Ícone do destaque: 🌿
  - Destaque: Cada sinal é uma pista. Nenhum fecha uma resposta sozinho.
- **Fatos usados:**
  - Crise como sobrecarga do sistema nervoso ('transbordou'): LP/aprender/birra-ou-crise.html:212
  - Se suspeitar de crise: baixar o estímulo (luz, som, gente perto) e ficar por perto sem exigir explicação: LP/aprender/birra-ou-crise.html:225
  - Três sinais para diferenciar: LP/aprender/birra-ou-crise.html:214-218
  - Nenhum sinal sozinho fecha uma resposta; use como pista: LP/aprender/birra-ou-crise.html:220

### `c_apos_crise` **[ISABELLA]**
Família C · 15 s · QR: aprender:crise, layout padrao, dias 2,3,5
- **Intenção:** Dica acionável do depois: diminui culpa por 'não ter conseguido conversar' no momento. Valor antes do QR.
- **Imagem:** `img/clinica-fachada.webp` (alternativas: `img/clinica-atividade-pedagogica.webp`, `img/clinica-recursos-terapeuticos.webp`)
- **Texto na tela:**
  - Kicker: 🫧 Dica para hoje
  - Headline: Primeiro o corpo acalma. <em>Depois, as palavras.</em>
  - Subtexto: Depois de uma crise, espere o corpo acalmar antes de conversar. É nesse momento que o cérebro volta a conseguir ouvir.
  - Selo: Aprender
  - Título da ação: Birra ou crise: o que fazer
  - Descrição da ação: O que fazer na hora, e o que muda quando é birra.
  - Título do QR: Leia o texto completo
  - Texto do QR: Aponte a câmera e abra o texto no seu celular.
  - Dica sob o QR: Texto escrito pela Isabella
  - Ícone do destaque: 💬
  - Destaque: Na birra, nomeie o que você entende e mantenha o combinado, com calma.
- **Fatos usados:**
  - Só depois que o corpo acalmar, o cérebro volta a conseguir ouvir palavras: LP/aprender/birra-ou-crise.html:225
  - Na birra, nomear o que você entende e manter o combinado, com calma: LP/aprender/birra-ou-crise.html:226

### `c_brincar_chao` **[ISABELLA]**
Família C · 15 s · QR: aprender:brincar, layout padrao, dias 1,3,4
- **Intenção:** Dica acionável imediata (uma brincadeira real do artigo) e alívio (10 minutos bastam).
- **Imagem:** `img/clinica-atividade-pedagogica.webp` (alternativas: `img/clinica-recursos-terapeuticos.webp`, `img/clinica-painel-sensorial.webp`)
- **Texto na tela:**
  - Kicker: 🎨 Dica para hoje
  - Headline: 10 minutos de brincar <em>trabalham habilidades</em>.
  - Subtexto: Caça ao tesouro de cores: peça para achar 3 objetos de uma cor pela casa. Trabalha atenção e seguir instruções, no ritmo de brincadeira.
  - Selo: Aprender
  - Título da ação: 5 brincadeiras de 10 minutos
  - Descrição da ação: Cada ideia diz qual habilidade ela trabalha, de atenção a esperar a vez.
  - Título do QR: Leia as 5 brincadeiras
  - Texto do QR: Aponte a câmera e abra o texto no seu celular.
  - Dica sob o QR: Texto escrito pela Isabella
  - Ícone do destaque: 🌈
  - Destaque: Dia agitado? O telefone sem fio de sentimentos é mais calmo.
- **Fatos usados:**
  - Dez minutos, um pouco de atenção e cinco ideias: LP/aprender/brincar-com-proposito-10-minutos.html:206
  - Caça ao tesouro de cores (3 objetos, atenção e seguir instruções): LP/aprender/brincar-com-proposito-10-minutos.html:208-209
  - Se o dia foi agitado, telefone sem fio de sentimentos (mais calmo): LP/aprender/brincar-com-proposito-10-minutos.html:226

### `c_elogio` **[ISABELLA]**
Família C · 15 s · sem QR, layout padrao, dias 1,2,5
- **Intenção:** Dica de uso imediato, sem QR e sem pedido. Dá ao pai um gesto pequeno e possível.
- **Imagem:** `img/clinica-painel-sensorial.webp` (alternativas: `img/clinica-atividade-pedagogica.webp`, `img/clinica-fachada.webp`)
- **Texto na tela:**
  - Kicker: 🌟 Dica para hoje
  - Headline: Hoje, diga o que <em>deu certo</em>.
  - Subtexto: Reconhecer o que deu certo é a base do reforço positivo. Escolha um acerto do dia e conte para a criança, com atenção e afeto.
- **Fatos usados:**
  - Reforço positivo: reconhecer o que deu certo: LP/aprender/como-e-a-terapia-comportamental.html:212
  - Reforçar o que você quer ver crescer, com a sua atenção e o seu afeto: LP/guia.html:602

### `c_construir` **[ISABELLA]**
Família C · 15 s · sem QR, layout padrao, dias 3,4,5
- **Intenção:** Dica de uso imediato, sem QR e sem pedido; uma brincadeira diferente da caça às cores do slide c_brincar_chao.
- **Imagem:** `img/clinica-recursos-terapeuticos.webp` (alternativas: `img/clinica-fachada.webp`, `img/clinica-atividade-pedagogica.webp`)
- **Texto na tela:**
  - Kicker: 🗣️ Dica para hoje
  - Headline: Empilhar e derrubar, <em>revezando</em>.
  - Subtexto: Empilhe blocos com a criança e derrubem juntos, revezando quem constrói. Trabalha a atenção compartilhada: ela olha o objeto e depois olha para você.
- **Fatos usados:**
  - Construir e derrubar, revezando quem constrói; trabalha atenção compartilhada (olha o objeto e depois olha para você): LP/aprender/brincar-com-proposito-10-minutos.html:214-215

### `c_esperar` **[ISABELLA]**
Família C · 15 s · sem QR, layout padrao, dias 1,2,3,4
- **Intenção:** Dica de uso imediato, sem QR; transforma um momento de espera em brincadeira.
- **Imagem:** `img/clinica-atividade-pedagogica.webp` (alternativas: `img/clinica-painel-sensorial.webp`, `img/clinica-recursos-terapeuticos.webp`)
- **Texto na tela:**
  - Kicker: ⏳ Dica para hoje
  - Headline: Esperar a vez <em>também se treina</em> brincando.
  - Subtexto: No Siga o líder, um dá o comando (pular, girar, ficar parado) e o outro segue. Depois troca. A criança treina esperar a vez.
- **Fatos usados:**
  - Siga o líder: um dá o comando, o outro segue, depois troca; trabalha esperar a vez: LP/aprender/brincar-com-proposito-10-minutos.html:220-221
  - Ensinar a esperar a vez como propósito de brincadeira: LP/aprender/como-e-a-terapia-comportamental.html:212


---

## D. Playground e Circuito

### `d_fds`
Família D · 15 s · sem QR, layout padrao
- **Intenção:** Convite concreto para o fim de semana, com o horário mais calmo; reduz o receio da primeira visita.
- **Imagem:** `img/playground-mediadora-tapete.webp` (alternativas: `img/hero-piscina-bolinhas.webp`, `img/playground-piscina-casinha.webp`)
- **Texto na tela:**
  - Kicker: 🌤️ Fim de semana no Playground
  - Headline: Primeira visita? Vá no <em>Horário Inclusivo</em>.
  - Subtexto: Das 10h às 16h (aos domingos, a partir das 12h): som mais baixo, menos lotação e equipe reforçada. Sábado de manhã também vale.
- **Fatos usados:**
  - Horário Inclusivo, todos os dias, 10h às 16h: LP/llms-full.txt:76, 96; LP/playground.html:2095-2097
  - Som mais baixo, menos lotação e equipe reforçada; horário indicado para a primeira visita: LP/llms-full.txt:96
  - Aberto a qualquer família: LP/llms-full.txt:99

### `d_parque`
Família D · 15 s · sem QR, layout padrao
- **Intenção:** Informação logística sem adjetivo: onde e quando. Remove o passo de agendamento.
- **Imagem:** `img/playground-fachada-recepcao.webp` (alternativas: `img/playground-piscina-casinha.webp`, `img/galeria-oficinas.webp`)
- **Texto na tela:**
  - Kicker: 📍 Playground no Parque Shopping
  - Headline: Playground no Parque Shopping, <em>no 1º piso</em>.
  - Subtexto: Segunda a sábado, das 10h às 22h. Domingo, das 12h às 21h. É só chegar: não precisa agendar.
- **Fatos usados:**
  - 1º piso, seg a sáb 10h-22h e dom 12h-21h: LP/llms-full.txt:93; LP/playground.html:2543-2544
  - Sem agendamento, é só chegar: LP/playground.html:2582; LP/llms-full.txt:87

### `d_graopara`
Família D · 15 s · sem QR, layout padrao, só com fotoGraoPara
- **Intenção:** Informação logística da segunda unidade. Slide só entra quando a foto real existir.
- **Imagem:** `img/playground-grao-para.webp`
- **Texto na tela:**
  - Kicker: 📍 Playground no Grão-Pará
  - Headline: No Grão-Pará, <em>1º piso</em>, em frente à Renner.
  - Subtexto: Shopping Bosque Grão-Pará. Segunda a sábado, das 10h às 22h. Domingo, das 12h às 21h. Mesmos preços do Parque Shopping.
- **Fatos usados:**
  - 1º piso, em frente à Renner; seg-sáb 10h-22h, dom 10h-21h: LP/llms-full.txt:44, 93; LP/playground.html:2557
  - Mesmos preços: LP/playground.html:2559

### `d_prova`
Família D · 15 s · sem QR, layout padrao
- **Intenção:** Prova por especificidade, com fonte dita na própria frase. Vale só para o Playground, nunca para a clínica.
- **Imagem:** `img/hero-piscina-bolinhas.webp` (alternativas: `img/playground-piscina-casinha.webp`)
- **Texto na tela:**
  - Kicker: 📊 Números do Playground
  - Headline: +1.100 famílias passaram pelo <em>Playground</em>.
  - Subtexto: Dados do sistema de entrada e saída do Playground. A equipe tem nota 4,9 de 5 em 118 avaliações por WhatsApp, de julho a outubro de 2026.
- **Fatos usados:**
  - Mais de 1.100 famílias registradas no sistema de entrada e saída: LP/playground.html:2216. As 7.500 visitas saíram do slide por pedido da clínica (número superestimado).
  - Média da equipe 4,9 de 5, avaliações por WhatsApp, jul a out/2026: briefing do pedido; conferido no conector de NPS (média_equipe_1a5 = 4,9)
  - ATENÇÃO: o conector hoje retorna 119 respostas (jul a 25/out); o briefing manda escrever 118. Atualizar o número se a TV for publicada depois

### `d_beneficio`
Família D · 15 s · sem QR, layout padrao
- **Intenção:** Identidade (pertencimento) em vez de desconto. O detalhe do benefício vem de CONFIG.beneficioFamilia.
- **Imagem:** `img/playground-mediadora-tapete.webp` (alternativas: `img/galeria-oficinas.webp`)
- **Texto na tela:**
  - Kicker: 💛 Família FaçaAmigos
  - Headline: Você faz parte da <em>Família FaçaAmigos</em>.
  - Subtexto: Seu vínculo com a clínica vale também fora dela. {{beneficio}}
- **Fatos usados:**
  - Texto do benefício: CONFIG.beneficioFamilia (placeholder {{beneficio}}); nenhum valor ou desconto é citado
  - Comprimento: com o texto atual de CONFIG o subtext expandido fica com cerca de 140 caracteres

### `d_quando_ir`
Família D · 15 s · sem QR, layout padrao
- **Intenção:** Ajuda o pai a escolher o horário mais tranquilo (alívio) e a planejar o tempo real de visita.
- **Imagem:** `img/playground-piscina-casinha.webp` (alternativas: `img/hero-piscina-bolinhas.webp`)
- **Texto na tela:**
  - Kicker: 🗓️ Para planejar o sábado
  - Headline: Prefira a <em>manhã</em> ou o começo da tarde.
  - Subtexto: No sistema (jul a out/2026), sábado é o dia mais cheio e das 17h às 20h o horário mais cheio. Quem entra por 30 minutos fica, em média, 50 minutos.
- **Fatos usados:**
  - Conector de sessões (jul a out/2026, só leitura): sábado é o dia mais cheio (1.407 de 5.950 check-ins); as horas 17h a 20h concentram o movimento (713, 992, 964 e 783 check-ins); média de 50,7 min no plano de 30 minutos. O slide diz dia e horário separados, sem cruzar os dois (o conector não cruza)
  - Manhã e começo da tarde dentro do Horário Inclusivo 10h-16h: LP/llms-full.txt:76, 96

### `d_circuito`
Família D · 15 s · sem QR, layout padrao
- **Intenção:** Preço e opções de tempo, ditos como fato. Localização pelo quiosque, sem referência a lojas.
- **Imagem:** `img/circuito-quiosque.webp` (alternativas: `img/circuito-frota-alinhada.webp`, `img/circuito-jeep-menino.webp`)
- **Texto na tela:**
  - Kicker: 🚗 Circuito no Parque Shopping
  - Headline: Circuito: R$ 48 por <em>20 ou 30 minutos</em>.
  - Subtexto: 20 minutos nas pelúcias e no jeep, ou 30 minutos nos carros e na moto. No quiosque do Circuito, no Parque Shopping.
- **Fatos usados:**
  - R$ 48: 20 min pelúcias e jeep, 30 min carros e moto: LP/circuito.html:196, 1278; LP/llms-full.txt:66-67
  - Quiosque próprio no Parque Shopping Belém: LP/circuito.html:212, 1463


---

## E. Indicação do Mapeamento

### `e_indicar`
Família E · 15 s · QR: teste, layout padrao
- **Intenção:** Transforma o pai em canal de indicação; reciprocidade (ele já recebeu valor). Pressuposição: há alguém na sua roda.
- **Imagem:** `img/isabella-3.webp` (alternativas: `img/clinica-atividade-pedagogica.webp`)
- **Texto na tela:**
  - Kicker: 💌 Para quem você lembrou
  - Headline: Uma mãe que ainda não sabe <em>por onde começar</em>?
  - Subtexto: Pode ser mãe, pai ou avó. Envie o Mapeamento Comportamental: 25 perguntas, cerca de 5 minutos, gratuito.
  - Selo: Mapeamento
  - Título da ação: Indique o Mapeamento
  - Descrição da ação: Gratuito, cerca de 5 minutos, para crianças de 4 a 17 anos.
  - Título do QR: Aponte a câmera aqui
  - Texto do QR: Leia o código, abra a página e envie o link para quem você lembrou.
  - Dica sob o QR: Mande o link por WhatsApp
  - Ícone do destaque: 📩
  - Destaque: O resultado aparece na tela e também chega por e-mail.
- **Fatos usados:**
  - 25 perguntas rápidas: LP/teste.html:937; LP/teste-perguntas.json:5
  - Cerca de 5 minutos: LP/teste.html:932; LP/teste-perguntas.json:4
  - 100% gratuito: LP/teste.html:941
  - Crianças de 4 a 17 anos: LP/teste.html:978; LP/teste-perguntas.json:8-9
  - Resultado na tela e no e-mail: LP/teste.html:925, 1091

### `e_oque_e` **[ISABELLA]**
Família E · 15 s · QR: teste, layout padrao
- **Intenção:** Autoridade por transparência: o que é, quanto leva, o que mede e o que não faz. Prova de limite honesto.
- **Imagem:** `img/isabella-3.webp` (alternativas: `img/clinica-atividade-pedagogica.webp`)
- **Texto na tela:**
  - Kicker: 🧭 Mapeamento Comportamental
  - Headline: 25 perguntas em cerca de <em>5 minutos</em>.
  - Subtexto: Para crianças de 4 a 17 anos. Passa por cinco áreas: Emoções e segurança, Rotina e limites, Foco e energia, Amizades e convivência, Empatia e gentileza.
  - Selo: Mapeamento
  - Título da ação: Um retrato inicial, gratuito
  - Descrição da ação: Criado por Isabella Gonçalves Freitas, psicóloga infantil (CRP 10/4727).
  - Título do QR: Aponte a câmera aqui
  - Texto do QR: Leia o código e responda no seu celular, no seu ritmo.
  - Dica sob o QR: Resultado na tela e por e-mail
  - Ícone do destaque: 🧡
  - Destaque: Não substitui avaliação profissional.
- **Fatos usados:**
  - 25 perguntas, cerca de 5 minutos: LP/teste.html:932, 937; LP/teste-perguntas.json:4-5
  - De 4 a 17 anos: LP/teste-perguntas.json:8-9; LP/teste.html:978
  - Cinco áreas reais: LP/supabase/functions/behavior-test-webhook/index.ts:80, 88, 96, 104, 112
  - Resultado na tela e por e-mail: LP/teste.html:925, 1091
  - Não substitui avaliação profissional: LP/teste.html:946; LP/teste-perguntas.json:6
  - Criado por Isabella Gonçalves Freitas (CRP 10/4727): LP/teste.html:945
  - Gratuito: LP/teste.html:941


---

## R. Respiro

### `r_1` **[ISABELLA]**
Família R · 10 s · sem QR, layout respiro, dias 1,2,4
- **Intenção:** Pacing (o pai chegou até aqui) e leading (respire).
- **Imagem:** `img/clinica-painel-sensorial.webp` (alternativas: `img/ambiente-sensorial.webp`)
- **Texto na tela:**
  - Frase: Respire fundo. Chegar até aqui já é uma forma de cuidar.
- **Fatos usados:**
  - Acolhimento familiar, sem julgamento: LP/contexto.md:40
  - Sem afirmação clínica

### `r_2` **[ISABELLA]**
Família R · 10 s · sem QR, layout respiro, dias 2,3,5
- **Intenção:** Retira a comparação: desfaz a pressa sem prometer resultado.
- **Imagem:** `img/inclusao-cantinho-leitura.webp` (alternativas: `img/clinica-atividade-pedagogica.webp`)
- **Texto na tela:**
  - Frase: Cada criança tem o seu tempo. Cada família também.
- **Fatos usados:**
  - Respeito ao tempo de cada criança: LP/contexto.md:80
  - Sem afirmação clínica

### `r_3` **[ISABELLA]**
Família R · 10 s · sem QR, layout respiro, dias 1,3,4
- **Intenção:** Comando corporal sensorial (soltar os ombros) e acolhimento.
- **Imagem:** `img/ambiente-sensorial.webp` (alternativas: `img/clinica-painel-sensorial.webp`)
- **Texto na tela:**
  - Frase: Solte os ombros. Aqui você encontra acolhimento.
- **Fatos usados:**
  - Acolhimento familiar, sem julgamento: LP/contexto.md:40; compreensão com os pais cansados: LP/contexto.md:81
  - Sem afirmação clínica

### `r_4` **[ISABELLA]**
Família R · 10 s · sem QR, layout respiro, dias 2,4,5
- **Intenção:** Reconhece o esforço invisível de quem cuida.
- **Imagem:** `img/clinica-atividade-pedagogica.webp` (alternativas: `img/inclusao-cantinho-leitura.webp`)
- **Texto na tela:**
  - Frase: Pequenas vitórias merecem festa, mesmo as que ninguém viu.
- **Fatos usados:**
  - Celebrar pequenas vitórias: LP/contexto.md:80
  - Sem afirmação clínica


---

## Pontos sem fonte e dúvidas de fato

1. **Remarcação por WhatsApp (`a_falta`).** O briefing e o plano dizem que a falta dispara a remarcação por WhatsApp. O código envia só "a clínica sente a ausência" (`CF/lib/twilio-absence-bot.ts:24`) e, se o pai responde, a política diz que faltas não são reagendadas (`:48`). O slide fala apenas do aviso com atestado e do botão Pedir remarcação, que existe.
2. **Resposta da coordenação (`a_coord`).** `CF/app/familia/contact-coordination.tsx:101-102` diz que a coordenação responde "por aqui ou por telefone". O slide diz que a resposta fica registrada no portal; confirmar com a coordenação que toda resposta é registrada ali.
3. **Nota 4,9 em 118 avaliações (`d_prova`).** O conector de NPS hoje devolve 119 respostas de julho até 25/out/2026 (média da equipe 4,9). O briefing manda escrever 118; atualizar o número se a TV for publicada depois.
4. **Pico de sábado 17h às 20h (`d_quando_ir`).** O conector confirma sábado como dia mais cheio e média de 50,7 min no plano de 30 min, mas entrega dia e hora separados. O cruzamento sábado x 17h-20h vem do briefing.
5. **Sábado de manhã (`d_fds`).** A fonte diz Horário Inclusivo todos os dias, 10h às 16h. O slide usa o sábado como exemplo do fim de semana, sem restringir a esse dia.
6. **`c_pedido_curto`.** Não há artigo sobre pedido curto. O slide usa só o exemplo literal da caça ao tesouro de cores. Isabella pode trocar por outro conteúdo dela.
7. **`c_brincar_chao`.** O artigo não fala de "chão"; o slide fala de brincar por 10 minutos.
8. **`b_escola`.** O briefing diz "quando a família pede"; a fonte diz "quando fizer sentido". Usei a fonte. "Ninguém vai sozinho à reunião" adapta "você não sai sozinha da reunião com a escola" (`LP/clinica.html:483`).
9. **`a_metas`.** "Linguagem simples" vem do PRODUCT.md do sistema. Isabella confirma se o texto das metas escrito pela equipe segue isso.
10. **`a_mock`.** A saudação usa o nome da criança quando ele existe e cai em "seu filho(a)" quando não existe (`CF/app/familia/page.tsx:426-429`).
11. **`d_beneficio`.** Com o texto atual de `CONFIG.beneficioFamilia` a frase expandida contém a palavra "especial" ("condição especial"). Não se refere à criança, mas aparece na tela.
12. **`b_boasvindas`.** A duração de 40 minutos e os 120 do Treino ABA vêm do FAQ do chatbot do sistema (`CF/chatbot-base-conhecimento.md:50`), não de uma página do site.
13. **Licenças e fotos.** `d_graopara` usa `img/FOTO-GRAO-PARA.webp`, que ainda não existe. Slide fica desligado até a foto entrar.

## F. Desconto da Família (Mural do Portal)

Pedido da clínica: avisar que quem é atendido na Clínica tem desconto, visto no Mural. O nome do produto continua sendo **Portal da Família** e "Mural" é a seção dentro dele; por isso os textos dizem "Mural do Portal da Família" (a expressão "Mural da Família" segue proibida). O valor do desconto não aparece de propósito. Os slides só entram com `portalAtivo` ligado.

- `f_desconto` · 15 s · QR: portal · "Quem é atendido na Clínica tem desconto."
- `f_passos` · 20 s · QR: portal, layout tutorial · "Seu desconto está no Mural do Portal."
- `f_pergunte` · 15 s · sem QR · "Atendido aqui? Veja o desconto no Mural."

## G. Avaliação no Google

QR `avaliar` leva a https://g.page/r/CUpdqF5yECeVECE/review (link informado pela clínica). O texto pede a avaliação sem prometer nada em troca.

- `g_cinco` · 15 s · QR: avaliar · "Gostou do atendimento? Deixe 5 estrelas."
- `g_passos` · 20 s · QR: avaliar, layout tutorial · "Avaliar a clínica leva menos de 1 minuto."
- `g_outras` · 15 s · QR: avaliar · "Sua avaliação ajuda outra família a chegar até nós."

## H. Especialidades da Clínica

A Clínica tem 14 especialidades (mais a avaliação inicial), conforme `src/data/especialidades.json` e a página /clinica. Os slides de detalhe giram por dia da semana para a volta não passar de 12 min.

- `h_14` · 15 s · QR: clinica · "14 especialidades, uma equipe e um plano só." (todos os dias)
- `h_comportamento` · dias 1 e 5 · ABA, Psicologia e Habilidades Sociais
- `h_fala` · dia 2 · Fonoaudiologia e Musicoterapia
- `h_aprender` · dia 3 · Psicopedagogia, Nutrição e Orientação Parental
- `h_motor` · dia 4 · Terapia Ocupacional, Integração Sensorial, Fisioterapia, Psicomotricidade e Educação Física Adaptada

## I. Pacotes particulares

Seguem o estilo dos cartões ilustrados de `public/img/pacotes/` (fundo creme, nome do pacote em cor própria, selo de sessões por mês, selo amarelo "3x sem juros" e mascote). Sem valores na tela: o site diz que valores e condições são passados pela equipe, pelo WhatsApp. Layouts novos: `pacotes` (três cartões por tela) e `cartao` (fundo creme com mascote recortado de `img/pacotes/mascote-*.webp`). QR `planos` leva a /planos.

- `p_pacotes_a` · todos os dias · "Pacotes mensais de 4 a 12 sessões." Cartões Primeiro Passo, Laço e Vínculo.
- `p_pacotes_b` · todos os dias · "Pacotes mensais de 16 a 24 sessões." Cartões Turma, Abraço e Voo Livre.
- `p_combinam` · dias 2 e 4 · "O mesmo pacote reúne várias terapias." Mascote macaco. A avaliação inicial conta como 1 sessão.
- `p_parcelas` · dias 1, 3 e 5 · QR: planos · "Pagamento em até 3x sem juros no cartão." Mascote tucano.

## Mapeamento Comportamental: grátis em destaque

`e_indicar` e `e_oque_e` passam a ter "grátis" no kicker, no selo, no título da ação e no destaque. `p_pacotes_a` também lembra que o Mapeamento é grátis.

## J. Circuito (convite)

O Circuito só existe no Parque Shopping (quiosque no térreo). "Mesma equipe" vem da página /circuito. QR `circuito`.

- `j_convite` · QR: circuito · "Venha conhecer o Circuito FaçaAmigos." Foto fixa do caminhão de bombeiro (`img/circuito-bombeiro.webp`), o carro mais alugado, em modo retrato (o sorteio de fotos novas não troca).
- `j_equipe` · dias 1, 3 e 5 · sem QR · "No Circuito, a mesma equipe FaçaAmigos."

## K. Playground no Grão-Pará

Endereço, horário, "mesmos preços, mesma equipe e mesmos atrativos" e o WhatsApp (91) 99110-1215 vêm de /playground e do `marca.json`. Só entram com `fotoGraoPara` preenchido. QR `graopara` leva a /playground/grao-para.

- `k_vem` · QR: graopara · "Brinque também no Grão-Pará."
- `k_equipe` · dias 2 e 4 · sem QR · "No Grão-Pará, a mesma equipe do Parque Shopping."

## Rodízio por dia (para a volta ficar em até 12 min)

`d_fds` e `d_prova` dias 1, 3 e 5; `d_quando_ir` e `d_beneficio` dias 2 e 4; `f_pergunte` dias 1, 3 e 5; `p_combinam` dias 2 e 4; `p_parcelas` dias 1, 3 e 5.

## Fotos novas (pasta "Faça Amigos" do Drive)

25 fotos em `public/img/tv3/` (WebP de até 1600 px, 3,3 MB no total), tiradas da pasta do Drive para reduzir a repetição de imagens. Cada slide abaixo lista 3 a 5 fotos e a TV troca por dia da semana (dia 1 mostra a 1ª, dia 2 a 2ª, e assim por diante). Fotos verticais têm `-v` no nome e entram na lateral do slide (layout retrato), sem esticar. As pessoas das fotos de crianças têm o rosto alterado por IA, segundo a clínica.

- `d_circuito`, `j_equipe`: Circuito (carros, pelúcias, criança ao volante).
- `d_parque`: fachada e, segundo a clínica, as fotos do salão com piscina de bolinhas e da sala com tapete de sol, que são do Parque Shopping.
- `d_fds`, `d_quando_ir`, `d_prova`, `d_beneficio`: ambientes e crianças do Playground, e o banner dos mascotes.
- `c_brincar_chao`, `c_construir`, `h_motor`, `h_aprender`: fotos novas, com a foto antiga da clínica na última posição.
- Ficaram de fora: fotos de obra, folhas de adesivo dos mascotes, fotos da equipe (aguardam confirmação) e três panorâmicas de 1200 px (borradas em Full HD).

## TV de 32" e orientação (horizontal ou vertical)

Tudo fica no `CONFIG` do `tv3.html`:

- `tela: '32'` (padrão): textos e QR maiores para uma TV de 32 polegadas. Nela 1 px do palco mede 0,37 mm (numa TV de 55", 0,64 mm). O texto de cada slide encolhe sozinho só se não couber, até 66% do tamanho, e depois o QR encolhe até 260 px. Para uma TV grande, use `tela: 'grande'`. Para testar sem mexer no código: `?tela=32` ou `?tela=grande` na URL.
- `orientacao: 'horizontal'` (padrão) ou `'vertical'`: como a TV fica na parede. Também vale `?orientacao=vertical` na URL. A TV decide sozinha se precisa girar a imagem: se o sistema da TV já girou a tela (chega 1080x1920), não gira; se a tela chega deitada (1920x1080), gira o palco em pé e ocupa a tela inteira.
- `giro: 90` (padrão) ou `270`: só para TV em pé que o sistema da TV não girou. Use o lado para onde a TV foi virada.

Para pôr a TV em pé, a edição é uma linha: `orientacao: 'vertical'`. Os layouts em pé já foram conferidos (QR, tutorial, pacotes, mascote, foto vertical).

## QR com arte

`CONFIG.qrEstilo`: `'arte'` (padrão) ou `'classico'` (QR quadrado simples, para voltar atrás com uma linha).

- Módulos arredondados e os três "olhos" do canto em rosa, verde e azul. Contraste, margem e correção de erro iguais ao QR clássico.
- Selo com anel colorido que muda por destino (Portal rosa, Mapeamento verde, Circuito azul, Playground e Grão-Pará laranja, Planos mostarda) e um anel tracejado que pulsa. Tudo fica fora da área de leitura.
- Mascote por destino: macaco no Portal e na Avaliação, tartaruga no Mapeamento e nas dicas, tucano no Circuito, cachorro no Playground, Grão-Pará, Clínica e Planos (`img/tv3/mascote-*.webp`).
- Leitura medida com o decodificador de teste (jsQR, com desfoque): o clássico lê a partir de 56 px de largura na imagem; o QR com arte, de 56 a 85 px conforme o endereço. Os testes `qr` decodificam todos os QR de todos os slides em pé e deitado.

## Painel HD de 32" e qualidade da imagem

- Pensado para painel HD (1366x768 ou 1280x720), que mostra o palco a ~71% (ou 67%) do tamanho. Os textos têm um piso (o encolhimento automático para em 80%) e o menor texto na tela fica em ~14 px em 1366x768. Sem `backdrop-filter` na TV de 32" (pesa na GPU de TV HD).
- **Fotos melhoradas para a TV:** `scripts/tv3-imagens.py` gera cópias em `public/img/tv/` com brilho (gama 0,86), cor (+25%), contraste (+5%) e nitidez (máscara de nitidez depois de reduzir a foto ao tamanho da TV, até 1400 px de largura). As fotos originais, usadas pelo site, não mudam. Depois de trocar uma foto de slide, rode `python3 scripts/tv3-imagens.py` e `python3 scripts/tv3-pool.py` (o teste `copy` avisa se faltar).
- Mascotes e cartões de pacote também têm cópia em `public/img/tv/`, com ajuste mais leve (gama 0,92, cor +12%; nitidez leve só nos cartões opacos, e nenhuma nos mascotes de fundo transparente, para não sujar a borda). O logo do cabeçalho não é alterado (cor de marca).
- Formato: todas as imagens da tv, tv2 e tv3 já são WebP, exceto o logo (`logo-simbolo.png`, 15 KB). Converter o logo ganharia ~10 KB por TV e deixaria o cabeçalho sem imagem em TV que não abre WebP, então fica como PNG.
- As fotos da fotógrafa (Supabase) não podem ser refeitas aqui: recebem só um filtro leve de brilho e cor no navegador.
- O rodapé tem o site à esquerda e o Instagram à direita (`rodapeSite` e `rodapeInstagram` no `CONFIG`).

## Compatibilidade com o navegador da TV, lag e relógio

- **Espaço entre itens sem `gap`.** O `gap` de caixa flexível só existe a partir do Chrome 84, e o navegador da TV é mais antigo: na foto da TV o QR colou no texto e o ponto verde colou em "SALA DE ESPERA". Agora o espaço é feito com margem. `gap` só resta em contêiner de grade. Também saíram `aspect-ratio` e `clamp()`. O teste `antiga` (e o cenário "navegador antigo" do `qrlayout`) simula esse navegador e confere isso.
- **Foto atrasada.** O slide só aparece depois que a foto (e o mascote) chegaram, com no máximo 3 s de espera. A foto do próximo slide baixa enquanto o atual está na tela. O teste `antiga` simula internet lenta (700 ms por imagem).
- **Barra de progresso removida.** Ela redesenhava a tela a cada 80 ms.
- **Menos animação na TV de 32".** Sem zoom lento na foto e sem deslizar o slide inteiro: só um fade curto.
- **Relógio sem segundos.** Mostra HH:MM e só mexe na tela quando o minuto muda.

## Autoexame

Regex sobre `tv3-slides.json`: `promessa|confian[çc]a|oferta|garantid|cura\b|especial|normal|problem|!|—|convênio|IASEP|PROASA`

- Resultado: **vazio**
- Famílias: A=12, B=9, C=8, D=7, E=2, R=4 (total 42)
- Limites de tamanho (headline 58, subtext 165, kicker 34, actionTitle 34, actionDesc 105, qrTitle 30, qrDesc 88, qrHint 38, highlightText 88, passo título 28 e desc 62, comparativo cabeçalho 28 e item 44, quote 88): **nenhum campo acima do limite**. Medido sobre o texto visível, com os tokens expandidos ("Boa noite", "segunda-feira", rede de 20 caracteres e o texto atual de `CONFIG.beneficioFamilia`); os headlines também cabem com as tags `<em>` contadas.
- Sem exclamação, sem travessão longo, sem "não é X, é Y", sem lista de negações; as únicas negações são "sem exigir explicação" (fonte literal) e "não precisa agendar" (fato real, dito uma vez).
