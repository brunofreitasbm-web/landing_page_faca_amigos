# Como publicar (ordem obrigatória)

Projeto Supabase: `ivjvpdzsfjdpyabbzzuj`. Site: Vercel, publica a cada push na branch `main`.
Este arquivo vale mais que trechos antigos do `LEIA-ME.txt` quando houver conflito.

## Lote 1: segurança (pendente, feito só no código em 21/09/2026)

1. Escolher uma chave longa (ex.: `openssl rand -hex 32`) e gravar como secret:
   `supabase secrets set SEQ_RUN_KEY=<chave> --project-ref ivjvpdzsfjdpyabbzzuj`
2. Aplicar as migrations `20260921120000_fase0_seguranca.sql` e `20260921130000_fa_teste_origem_extra.sql`.
3. Rodar `supabase/ops/reagendar-crons.sql` no SQL Editor (troca `<chave>`). Isso põe a chave no Vault e refaz o cron.
   **Só depois**, implantar `guia-sequence`. Se a função nova subir antes do cron novo, a sequência de e-mails para de
   rodar (recusa o `?run=1` sem chave) até o cron ser refeito.
4. Implantar `behavior-test-admin`, `behavior-test-webhook`, `wifi-coupon-admin`, `wifi-lead-webhook`
   (todas com `verify_jwt` desligado, como hoje).
5. Push do site. Conferir: `/hotspot/login.html` deve dar 404 e `POST guia-sequence?run=1` sem chave deve dar 401.
6. Trocar a senha `visitante` no MikroTik antes de instalar o portal (ver `hotspot/LEIA-ME-HOTSPOT.md`).

## Lote 2: site com rastreamento e consentimento

Depende só do site (mais a migration de origem, já no lote 1 e a função `behavior-test-webhook` nova, que grava
`utm_term`, `gclid` e `fbclid`). Regra de sempre: migration, depois função, depois site.

Depois de publicar, no GTM (`GTM-NPDJ58XR`):
- Os eventos novos chegam no `dataLayer`: `whatsapp_click`, `begin_checkout`, `file_download`, `scroll_depth`,
  `consent_update`. Criar as tags/acionadores no GTM para levá-los ao GA4.
- Conferir se o container já tem uma tag GA4 além do `gtag` direto do `fa-track.js`. Se tiver, uma das duas precisa sair
  (senão o `page_view` conta em dobro).
- Tags de anúncio (Meta etc.) dentro do GTM devem exigir consentimento (`ad_storage`).

## Lote 3: webhook da Hotmart

1. Aplicar `20260921140000_hotmart_webhook.sql`.
2. Secrets: `HOTMART_HOTTOK` (o "hottok" do painel), `HOTMART_CODIGO_PRODUCT_ID` (id numérico do Código; o
   `?list_products=1` do `hotmart-sync` mostra) e `HOTMART_PRODUCT_ID` passa a aceitar lista: `8560642,<id do Código>`.
3. Implantar `hotmart-webhook` (`verify_jwt` desligado; a proteção é o hottok) e `hotmart-sync`.
4. Na Hotmart: Ferramentas > Webhook, URL `https://ivjvpdzsfjdpyabbzzuj.supabase.co/functions/v1/hotmart-webhook`,
   versão 2.0.0, eventos de compra aprovada/completa, reembolso, chargeback, cancelada e carrinho abandonado.
5. Usar o teste de envio do painel da Hotmart para cada evento e conferir `select * from fa_hotmart_eventos order by
   received_at desc;` (coluna `error` vazia). Se algum campo vier com outro nome, ajustar em `hotmart-webhook/index.ts`.
6. Uma compra real de teste confirma a cadeia toda (compra gravada, sequência parada, e-mail de boas-vindas).

## Lote 4: GEO — fonte única de fatos ligada ao quiosque (pendente, feito só no código em 27/09/2026)

Objetivo: o site, o JSON-LD e os `llms*.txt` deixam de ser escritos à mão e passam a refletir o que o
app dos quiosques (Supabase `ivjvpdzsfjdpyabbzzuj`, tabelas `fa_kiosk_plans`/`packages`/`coupons`) cobra
de verdade. Regra decidida com o usuário em 27/09/2026: o preço de tabela do quiosque tem desconto
automático de 40% para o público geral e 50% para crianças neurodivergentes (laudo/CIPTEA) — é exatamente
o que reproduz os R$ 60/108/192/270/840 já publicados no site.

1. Implantar a função nova: `supabase functions deploy geo-facts --no-verify-jwt --project-ref ivjvpdzsfjdpyabbzzuj`
   (GET público, sem secret novo). Conferir com `curl` que só saem preços/pacotes/endereço — nunca dado de família.
2. `npm run geo` (baixa `geo-facts.json` da função e regenera `llms.txt`/`llms-full.txt`) → revisar o diff → `npm run
   check` → commit → push.
3. Implantar a versão nova de `fa-health` (seção "GEO": compara os % de desconto e os preços do quiosque com o que o
   site pressupõe; alerta por e-mail se divergir). Testar com `?dry=1` + `x-ops-key`.
4. Merge do workflow `.github/workflows/geo-sync.yml` (roda `npm run geo` todo dia às 06h de Belém e abre PR se algo
   mudou; o merge continua manual).
5. Push de `assets/fa-track.js` (classifica visitas vindas de ChatGPT/Perplexity/Gemini/Copilot/Claude como
   `utm_medium=ai`). Criar a dimensão personalizada `ai_engine` (escopo usuário) no GA4 — passo manual, painel do GA4.
6. Implantar a versão nova de `fa-weekly-report` (seção "Visitas vindas de IA").

Pendente (não faz parte deste lote): CTA de pré-check-in nas páginas (falta a URL pública do formulário do app do
quiosque) e `AggregateRating` a partir de `fa_kiosk_google_reviews` (a tabela está vazia; não confirmado se guardaria
notas reais do Google).

## Lote 5: módulo "É para todas as crianças" (pendente, feito só no código em 29/09/2026)

Só arquivos estáticos, sem função nem migration. Não depende dos lotes anteriores.

1. Isabella lê e aprova `aprender/e-para-todas-as-criancas.html` (sai assinado por ela) e `conteudo/e-para-todas-kit.md`.
2. Confirmar com a operação o "Horário Inclusivo 10h–16h", citado no guia e na resposta nova da FAQ.
3. `npm run check` → `npm run geo:check` → commit → `npm run sitemap` → push.
4. Depois do deploy: abrir `/playground#para-todas` e o guia no celular; testar o playground no Rich Results Test
   (a FAQ agora tem 8 perguntas).
5. Cadastrar as respostas rápidas no WhatsApp Business e agendar o carrossel (textos em `conteudo/e-para-todas-kit.md`).

## Lote 6: Hub de Gestão, gestao.institutofacaamigos.com.br (pendente, feito só no código em 29/09/2026)

Login único (senha da Clínica + código de 6 dígitos por e-mail) e 5 quadrados que abrem cada sistema já logado.
Como nenhum sistema compartilha sessão com outro, o hub gera um ticket de uso único e cada sistema tem uma
porta de entrada. **Nada disto está no ar.** Código em: `gestao.html`, `supabase/functions/gestao-hub/`,
`supabase/migrations/20260930120000_gestao_hub.sql`, `middleware.js`, e uma branch `feat/sso-gestao` em cada
sistema (Clínica, Simulador Financeiro, Playground, Gestão de Pessoas, HubOperacoes).

Ordem (cada passo é inofensivo sozinho, só o último abre o hub):

1. **Migration** `20260930120000_gestao_hub.sql` (5 tabelas com RLS ligado e sem policy + limpeza diária).
2. **Secrets** (Supabase `ivjvpdzsfjdpyabbzzuj`): `CLINICA_SUPABASE_SERVICE_ROLE_KEY` (service role do projeto
   `vththexblpxwocbowhsv`), `GESTAO_SSO_SECRET_CACAU` (string aleatória longa). `CLINICA_SUPABASE_URL`,
   `CLINICA_SUPABASE_ANON_KEY` e `BREVO_*` já existem. Opcionais (têm padrão): `GESTAO_URL_PLAYGROUND`,
   `_CLINICA`, `_FINANCEIRO`, `_RH`, `_CACAU`. Na **Vercel do hub-operacoes**: o mesmo `GESTAO_SSO_SECRET_CACAU`.
3. **Função** `gestao-hub` com `verify_jwt = false` (o Bearer é o token do hub, igual a `behavior-test-admin`).
4. **Portas de entrada** (merge + deploy de cada branch `feat/sso-gestao`): Clínica `/auth/sso`, Financeiro
   `/auth/sso`, Playground `/sso`, Gestão de Pessoas `/sso`, HubOperacoes `POST /api/auth/sso` + `#sso=`.
   A Clínica e o Playground fazem deploy na Vercel; o Simulador e o hub-operacoes também.
5. **Contas** (já inseridas em 29/09/2026): `fa_gestao_contas` tem Bruno e Isabella. O login do hub é o da Clínica
   (CPF ou o e-mail interno `equipe_…@staff.facaamigos.local`), o código vai para `email_codigo` (Gmail real), e cada
   quadrado usa o usuário daquele sistema: Playground `employee-…@kiosk.internal`, Clínica o e-mail interno, Financeiro o
   Gmail (Auth A), Gestão de Pessoas `bruno@`/`isabella@portoterapia.com`, Cacau Show `Bruno`/`Isabella` (owner).
6. **DNS + site**: CNAME `gestao` → Vercel, adicionar `gestao.institutofacaamigos.com.br` ao projeto
   `facaamigos-site`, `npm run check` → commit → push.

Botão "Esqueci a senha" (já aplicado no Supabase em 29/09/2026: migration `20260930130000_gestao_hub_esqueci_senha.sql` e função `gestao-hub` v5):
manda o código para o `email_codigo` cadastrado e troca a senha **do Sistema da Clínica** (é a mesma do hub), derrubando as
sessões abertas do hub. Precisa do secret `CLINICA_SUPABASE_SERVICE_ROLE_KEY`. Só a página `gestao.html` depende do merge.

Teste ponta a ponta: login errado, e-mail fora da lista (mesma mensagem de senha errada), código errado 5×,
código certo, cada quadrado abre logado, reabrir a mesma URL de entrada tem que falhar, Sair, e conferir
`fa_gestao_auditoria`.

## Lote 7: Eventos (palestras, encontros e treinamentos) — pendente, feito só no código em 30/09/2026

Inscrição com vagas reais, lista de espera com promoção automática (24h para confirmar), voucher `EVT-XXXX-XXXX`
com QR, check-in na porta pelo painel, ingresso pago via Hotmart e Comunidade WhatsApp (só avisos) + listas do Brevo.
Código: `supabase/migrations/20261001120000_fa_eventos.sql`, `supabase/functions/eventos-public|eventos-admin|eventos-dispatch/`,
`hotmart-webhook` (ramo de ingresso), `eventos.html`, `evento.html` (dinâmica: `/eventos/<slug>` reescreve para ela em
`vercel.json`), `ingresso.html`, aba "Eventos" em `admin.html`, `descadastrar.html` (`?e=`), `politica-privacidade.html`.

Regra de escassez (decidida em 30/09/2026): o site só mostra número real. "Restam N vagas" aparece quando N <= 10 ou
N <= 30% das vagas; acima disso, "Vagas abertas"; lotado mostra o tamanho real da fila. Nada é inventado.

Ordem (cada passo é inofensivo sozinho; o site só mostra eventos quando houver um `published`):

1. **Migration** `20261001120000_fa_eventos.sql` (4 tabelas com RLS ligado e sem policy, view `fa_eventos_publicos`,
   funções `fa_eventos_*`). Ela só agenda o cron `fa-eventos-dispatch` se o segredo `ops_key` já existir no Vault; se
   não existir (caso do projeto em 30/09/2026), avisa e segue: o cron é ligado no passo 5 com `supabase/ops/agendar-eventos.sql`.
   Em seguida `20261001120100_fa_eventos_revoke_execute.sql` (só a service role executa as funções `fa_eventos_*`).
2. **Brevo**: criar duas listas ("Eventos · Famílias" e "Eventos · Profissionais") e anotar os ids. Criar os atributos de
   contato `WHATSAPP`, `TRILHA`, `ULTIMO_EVENTO` (texto) — sem eles a função ainda sincroniza, só com `NOME`.
3. **WhatsApp**: criar a Comunidade (canal de avisos) de cada trilha e copiar o link de convite.
4. **Secrets** (`supabase secrets set ... --project-ref ivjvpdzsfjdpyabbzzuj`): `EVENTOS_SECRET` (`openssl rand -hex 32`;
   assina os links do ingresso — trocar invalida todos os links já enviados), **`OPS_KEY`** (chave longa; NÃO existia em
   produção em 30/09/2026), `BREVO_LIST_EVENTOS_FAMILIAS`, `BREVO_LIST_EVENTOS_PROFISSIONAIS`,
   `COMUNIDADE_WHATSAPP_FAMILIAS`, `COMUNIDADE_WHATSAPP_PROFISSIONAIS` (opcionais: o evento pode ter o próprio link).
   `BREVO_*` já existem. Enquanto `EVENTOS_SECRET` ou `OPS_KEY` faltarem, `eventos-public` recusa inscrição com 503 antes
   de gravar qualquer coisa (listar e detalhe continuam funcionando).
5. **Funções**, todas com `--no-verify-jwt`: `eventos-dispatch` primeiro (as outras chamam ela), depois `eventos-public`,
   `eventos-admin` e a versão nova de `hotmart-webhook`.
   **Estado em 30/09/2026**: migrações, `eventos-dispatch`, `eventos-public` e `eventos-admin` já estão em produção.
   `hotmart-webhook` NÃO foi implantado: a versão em produção é a de 21/09 e o repositório tem, além do ramo de ingresso,
   o envio da compra ao GA4/Meta (commits de 22/09, ainda não publicados). Implantar essa função só quando for cadastrar
   o primeiro ingresso pago (ela é inerte sem tipo pago) e sabendo que leva o GA4/Meta junto (dormente sem `GA4_API_SECRET`
   e `META_CAPI_TOKEN`).
   Depois de `OPS_KEY` e `eventos-dispatch` no ar, rodar `supabase/ops/agendar-eventos.sql` (troca `<chave>` pela MESMA
   chave do `OPS_KEY`): grava `ops_key` no Vault e liga o cron. Testar com `?dry=1` antes de esperar o primeiro disparo.
6. **Site**: `npm run check` → commit → `npm run sitemap` → push. Conferir `/eventos` (agenda vazia mostra o convite ao
   mapeamento), `/eventos/qualquer-coisa` (mensagem "não está mais disponível") e `/ingresso` sem token ("link não é válido").
7. **Primeiro evento**: no painel (`/admin`, aba Eventos) criar o evento como rascunho, adicionar ao menos um tipo de
   ingresso gratuito com as vagas reais, preencher promessa e 3 benefícios, publicar. A seção "Próximos encontros" e o
   link "Eventos" do menu do hub aparecem sozinhos quando existe evento publicado.
8. **Ingresso pago**: criar o produto na Hotmart, cadastrar o tipo "pago" com o id numérico do produto e o link
   `https://pay.hotmart.com/...`. O webhook da Hotmart (Lote 3) já entrega a venda aqui. Venda que chegar antes do tipo
   existir fica marcada em `fa_hotmart_eventos.error = 'evento: ...'`: botão "Reprocessar Hotmart" no painel resolve.

Teste ponta a ponta (com um evento de 2 vagas em rascunho publicado só para teste):
- 3 inscrições pelo site: 2 confirmadas (voucher no e-mail, QR em `/ingresso?t=`), 1 lista de espera (posição 1).
- Repetir o e-mail de uma confirmada: resposta "já inscrita" sem código na tela e voucher reenviado por e-mail.
- Cancelar uma confirmada pelo link do ingresso: a da fila recebe "abriu uma vaga" e confirma pelo botão (ou expira em
  24h: `POST eventos-dispatch {action:"run"}` com `x-ops-key` e `?dry=1` mostra o que faria).
- Check-in no painel com o QR e com o código digitado; a segunda leitura diz "já entrou às HH:MM".
- Hotmart: "enviar teste" de PURCHASE_APPROVED com `product.id` de um tipo pago → inscrição `confirmada` origem `hotmart`
  e voucher; reenviar o mesmo evento não duplica.
- `select * from fa_eventos_envios order by created_at desc` mostra cada e-mail uma vez (status `enviado`).

## Lote 8: /admin como subsistema do Hub de Gestão (owner) e acesso limitado da equipe, 01/10/2026

O painel do site (`institutofacaamigos.com.br/admin`) passa a ser um quadrado do Hub: **Mapeamento Comportamental** e **Eventos** (mesmo painel, já na aba Eventos). Bruno e Isabella entram pelo Hub com um ticket de uso único (60 s) e ganham o painel completo. Quem entra pelo login direto de `/admin` recebe só o escopo `equipe`: cupons Wi-Fi e check-in (lista de inscritos sem e-mail/WhatsApp, sem editar, exportar, cancelar nem ver receita). O servidor barra; a tela só esconde.

Ordem obrigatória (o login direto continua dando acesso total até o passo 5, então nada trava):

1. Migração `20261001140000_gestao_painel_sso.sql` (aditiva): `painel_usuario` em `fa_gestao_contas` (preenchido com o e-mail das contas ativas), tabela `fa_gestao_painel_tickets`, coluna `escopo` em `fa_teste_admin_sessions` (sessões existentes viram `owner`).
(A tabela `fa_gestao_tickets_painel` e a ação `admin_sso` do `gestao-hub`, de uma versão anterior do quadrado Eventos, foram substituídas por este fluxo; a tabela ficou sem uso e pode ser apagada.)
2. Deploy das funções (`--no-verify-jwt`): `gestao-hub`, `behavior-test-admin`, `eventos-admin`. Sem a chave do passo 5, todas se comportam como antes.
3. Site (Vercel): `admin.html` e `gestao.html`.
4. Teste como owner: abrir `gestao.institutofacaamigos.com.br`, clicar em **Mapeamento Comportamental** e conferir que o painel abre já logado, com Leads e Textos. Clicar em **Eventos** e conferir que abre na aba Eventos. Recarregar a URL antiga com o ticket deve cair no login (ticket já usado).
5. Só depois do passo 4, virar a chave (reversível):

```sql
insert into public.fa_teste_config (key, value, updated_by)
values ('admin_login_direto', '{"escopo":"equipe"}'::jsonb, 'hub')
on conflict (key) do update set value = excluded.value, updated_at = now();
```

Para voltar ao comportamento anterior (login direto do Gestor = painel completo): `delete from public.fa_teste_config where key = 'admin_login_direto';`.

Depois da chave em `equipe`, o login direto aceita qualquer perfil da Clínica (não só Gestor), mas só entrega o escopo limitado. Quem precisa de acesso completo entra pelo Hub (conta ativa em `fa_gestao_contas` com `painel_usuario` preenchido). Para tirar o acesso de alguém: `update fa_gestao_contas set ativo = false where email = '...'` (o ticket e a sessão do Hub deixam de valer na hora; a sessão de 12 h do `/admin` já aberta vale até expirar, ou `delete from fa_teste_admin_sessions where admin_email = '...'`).

## Lote 9: cupom Wi-Fi no caixa do Playground e resumo na aba do /admin, 01/10/2026

- **Cupom no caixa do Playground.** `wifi-lead-webhook` já criava, no mesmo código `ESPERA-XXXX`, um cupom de uso único de +5 min no Circuito. Agora cria também o da meia inclusiva no Playground (`DESCONTO_PCT` 50, uso único, unidade `11111111-…`). O atendente digita o código no caixa e o próprio caixa trava o reuso. Se a criação falhar, o cadastro e o e-mail seguem normalmente e o erro fica em `fa_wifi_leads.playground_coupon_error`.
- **Validade.** O cupom do caixa não tem prazo próprio. Um job diário (`fa-wifi-cupons-vencidos`, 07:20 UTC) desativa no caixa os cupons `ESPERA-%` cujo cadastro passou de 15 dias. Não toca em nenhum outro cupom.
- **Aba Cupons Wi-Fi (só o owner):** resumo do portal (cadastros por período, aceite de WhatsApp e e-mail, cupons usados por unidade, vigentes, vencidos sem uso, quem voltou ao Wi-Fi, falhas ao criar cupom no caixa) e filtro por aceite de contato. Só apresenta: nada é enviado por e-mail nem para lista.
- **Equipe:** a aba mostra só código, nome e status. Telefone, e-mail, aceite de contato e resumo ficam fora.
- **Resgate pela aba** passa a recusar cupom já usado no caixa e, ao resgatar, desativa o cupom nas duas unidades do caixa.
- **Um benefício por cupom, no próprio caixa.** Gatilho `fa_kiosk_coupons_espera_um_uso` (migração `20261001160000_wifi_cupom_um_uso_no_caixa.sql`): quando um `ESPERA-%` é usado em uma unidade (`used_count` sobe), o mesmo código é desativado nas outras. Na vez seguinte a outra unidade responde `CUPOM_INVALIDO`; se dois caixas usarem o mesmo código ao mesmo tempo, o segundo recebe `CUPOM_ESGOTADO` (mesma mensagem que o caixa já trata). Só age em `ESPERA-%` e só quando `used_count` aumenta, então nenhum outro cupom é afetado. Para desligar: `drop trigger fa_kiosk_coupons_espera_um_uso on public.fa_kiosk_coupons;`.

Ordem: (1) migração `20261001150000_wifi_cupom_playground.sql`; (2) deploy de `wifi-lead-webhook` e `behavior-test-admin` (`--no-verify-jwt`); (3) site.

## Lote 10: Hub de Gestão com gerências, módulos e níveis, 13/10/2026 (pendente, feito só no código, branch `feat/hub-gestao-contas-niveis`)

- **Quem entra.** O owner cadastra pessoas no próprio Hub (botão "Pessoas e acessos", só para `papel = owner`). A gerência entra com **senha própria do Hub** (hash PBKDF2 em `fa_gestao_contas.senha_hash`) + código de 6 dígitos por e-mail. Bruno e Isabella viram `owner` e seguem com a senha da Clínica (`auth_modo = 'clinica'`) até decidirem migrar.
- **Convite.** Ao criar a pessoa, o Hub manda um e-mail com o link `gestao.institutofacaamigos.com.br/#primeiro-acesso`; ela informa o e-mail, recebe o código e define a senha (é o mesmo fluxo do "Esqueci a senha").
- **Níveis por módulo:** sem acesso / visualizar / operar / administrar, na tabela `fa_gestao_permissoes`. Owner é administrador em tudo. O `launch` recusa no servidor módulo sem nível; quadrado sem nível nem aparece.
- **Efeito dentro do /admin** (neste repositório): o ticket leva o nível do painel e o de Eventos; a troca (`sso`) grava `escopo` (painel) e `escopo_eventos` (eventos). `admin` = owner, `operar` = equipe, `ver` = só leitura, sem acesso = só sair.
- **Nos outros sistemas** (Playground, Clínica, Simulador, Gestão de Pessoas, Cacau Show) o Hub só controla **quem vê o quadrado** e a identidade da pessoa em cada um (campos preenchidos na tela). Ainda não cria contas lá nem aplica o nível: isso é a fase 2 (adaptadores de provisionamento + tabela de correspondência nível → papel nativo). O Cacau Show já recebe o nível no ticket (`n`).
- **Auditoria:** `conta_criada`, `conta_atualizada`, `conta_desativada`, `conta_reativada`, `convite_enviado`, `sessoes_revogadas`, `launch_negado`, `acao_owner_negada`, além dos eventos antigos. Aparece na própria tela.
- **Desativar** uma pessoa encerra na hora a sessão do Hub e a do /admin.

Ordem: (1) migração `20261013120000_gestao_contas_niveis.sql` (aditiva; promove as contas atuais a `owner`); (2) deploy de `behavior-test-admin` e `eventos-admin` (aceitam as colunas novas; ticket sem nível continua valendo como owner); (3) deploy de `gestao-hub`; (4) site (`gestao.html`, `admin.html`). Funções com `--no-verify-jwt`.

Teste: entrar como owner e conferir que tudo segue igual; cadastrar uma gerência de teste (Eventos = visualizar, Mapeamento = sem acesso), receber o convite, definir a senha, entrar e confirmar que só aparece Eventos, que o /admin abre direto em Eventos e que fazer check-in dá "sem permissão"; chamar `launch` de outro módulo direto na API e ver 403; desativar a pessoa e ver a sessão cair.

## Lote 11: TV do salão, Hora da Criança (/tv), 19/10/2026 (publicado)

Só o turno das 16h às 22h do `tv.html` mudou (a equipe das 10h às 15h59, o modo noturno e a `/tv2` ficaram como estavam).
Arquivos novos: `img/amigos/*.webp` (18 poses), `audio/voz/*.mp3` (42 falas), `conteudo/tv-salao-roteiro-de-vozes.md` e
`conteudo/manual-tv-salao.*` (os dois ficam fora do ar pelo `.vercelignore`, assim como `scripts/`).

1. As falas saem do roteiro: `python scripts/generate-voices.py` (precisa de `pip install edge-tts`; voz pt-BR-FranciscaNeural).
   Refazer um arquivo só: mude a linha no roteiro e regere. Nas falas, o nome do macaco é escrito "Cako" e o da tartaruga
   "Tátti" (grafia só para a voz acertar a pronúncia; na tela é Caco e Tati).
2. Na TV, abrir `/tv?modo=crianca` e dar 1 clique (libera o som e aceita os cookies). No Chrome em modo quiosque, usar
   `--autoplay-policy=no-user-gesture-required`.
3. Testar uma cena: `/tv?cena=estatua&dia=5` (cenas: oi, cor, estatua, bicho, resp, pausa).
4. Vinheta que avisa a dinâmica: `audio/vinheta-dinamica.mp3`, gerada por `python scripts/generate-vinheta.py` (precisa de numpy e ffmpeg).
5. Manual de operação para a equipe: `conteudo/manual-tv-salao.png` (1080x1920, para enviar no WhatsApp).

## Lote 12: controle da equipe pelo celular (/tv-controle), 19/10/2026

Arquivos novos: `tv-controle.html` (a página do celular), `assets/fa-realtime.js` (cliente mínimo do Supabase Realtime) e
`conteudo/manual-controle-celular.*`. O `tv.html` ganhou as cenas Hora de ir, Hora da calma e Festa e escuta o canal.

- Não precisa de nada no Supabase: usa Realtime Broadcast pelo canal `tv-<código>`, com a chave pública (anon) do projeto.
  Nenhuma tabela, função ou secret novos. Se o Realtime do projeto for desligado ou ficar só para canais privados, o
  controle para de funcionar (a TV segue normal, só sem receber comandos).
- 1ª vez em cada TV: abrir `/tv` (o código aparece por 90 s; depois, tecla `C`). No celular, abrir `/tv-controle` e digitar o código.
  Para escolher o código: `/tv?canal=XXXXXXXX` (8 letras e números).
- O endereço `/tv-controle` não está no sitemap e tem `noindex`.

## Links com origem (Instagram, QR, Google)

Use sempre `utm_source`, `utm_medium` e `utm_campaign`. O site guarda a origem e a leva até o lead e o checkout.

| Onde | Link |
|---|---|
| Bio do Instagram (teste) | `https://institutofacaamigos.com.br/teste?utm_source=instagram&utm_medium=bio&utm_campaign=teste` |
| Bio do Instagram (hub) | `https://institutofacaamigos.com.br/?utm_source=instagram&utm_medium=bio&utm_campaign=hub` |
| Stories / posts | `...?utm_source=instagram&utm_medium=story&utm_campaign=<tema>` |
| QR no Playground | `https://institutofacaamigos.com.br/teste?utm_source=qr&utm_medium=presencial&utm_campaign=playground` |
| QR no Circuito | `https://institutofacaamigos.com.br/teste?utm_source=qr&utm_medium=presencial&utm_campaign=circuito` |
| QR na Clínica | `https://institutofacaamigos.com.br/teste?utm_source=qr&utm_medium=presencial&utm_campaign=clinica` |
| Perfil do Google | `https://institutofacaamigos.com.br/?utm_source=google&utm_medium=organico&utm_campaign=perfil` |

## Verificação antes de cada push

- `npm run check` (ou `node scripts/check.mjs`): links internos quebrados, canonical/description/JSON-LD, imagens sem
  tamanho, `fa-track.js` faltando, `hotspot/` referenciado, `ebook/` fora do deploy. O GitHub Actions
  (`.github/workflows/check.yml`) roda o mesmo em push e pull_request. Só ERRO reprova; AVISO é informativo.
- `npm run sitemap`: refaz os `lastmod` do `sitemap.xml` pela data do último commit de cada página. Rode depois do commit.
- `npm run geo:check`: confere se `llms.txt`/`llms-full.txt` batem com `geo-facts.json` commitado (offline, roda no
  CI). `npm run geo` baixa fatos novos da função `geo-facts` e regenera os dois arquivos.
- `.vercelignore` agora também exclui `supabase/`, `scripts/`, `.github/`, `PUBLICAR.md` e `LEIA-ME.txt`
  (funções e migrations são implantadas pela CLI do Supabase, não pela Vercel).

## Arquivos compartilhados do site (`assets/`)

| Arquivo | Para quê |
|---|---|
| `fa-track.js` | GTM/GA4/Clarity/Contentsquare com consentimento, origem do visitante, eventos |
| `fa-footer.js` | Rodapé único (status das unidades e CNPJs numa constante só: virar "Clínica aberta" = 1 edição) |
| `fa-cta.js` | Barra de ação fixa no celular (hub, /playground, /circuito) |

Cache de `/assets/*` é de 1 dia: depois de mudar um deles, o visitante recebe a versão nova em até 24 h.

## Rotinas (alerta diário e resumo semanal)

Ver `supabase/ops/agendar-rotinas.sql` (ordem de execução comentada no arquivo). Secrets: `OPS_KEY`, `ALERT_EMAIL`
(opcional; senão usa `LEAD_NOTIFY_EMAIL`). Teste primeiro com `?dry=1`.

## Oferta do Código no resultado do teste

Secret `EBOOK2_URL=https://institutofacaamigos.com.br/codigo`. Sem ele, o resultado continua oferecendo só o guia.

## Lote 11: cupom Wi-Fi no Playground do Bosque Grão-Pará e e-mail com as duas unidades, 23/10/2026 (banco e funções aplicados em 23/10/2026; site pendente de merge)

- **Cupom no caixa do Grão-Pará.** `wifi-lead-webhook` passa a criar, no mesmo código `ESPERA-XXXX`, um terceiro cupom de uso único: meia inclusiva (`DESCONTO_PCT` 50) na unidade `Playground (Bosque Grão-Pará)` (`5fc99a57-81ee-4232-a105-1fcb4634cef4`). É a mesma regra do Parque. Se a criação falhar, o cadastro e o e-mail seguem e o erro fica em `fa_wifi_leads.graopara_coupon_error`.
- **Um benefício por cupom** continua valendo sem mudança no banco: o gatilho `fa_kiosk_coupons_espera_um_uso` e o job `fa-wifi-cupons-vencidos` trabalham por código `ESPERA-%`, então já cobrem a terceira linha.
- **E-mail do cupom** reescrito: sem botão de WhatsApp; lista os benefícios (meia inclusiva R$ 50 no Playground, nos dois shoppings; +5 min adicionais grátis no Circuito, seg a sex) e traz um cartão por lugar com endereço, horário, descrição e "Como chegar" (Parque Shopping, Bosque Grão-Pará e Circuito).
- **`/admin`, aba Cupons Wi-Fi:** reconhece uso no caixa do Grão-Pará ("Usado no caixa (Playground Grão-Pará)"), conta no resumo e na falha de criação, e o resgate pela aba recusa cupom já usado lá. O resgate pela aba continua com as operações `playground` e `circuito` (a coluna `coupon_operation` só aceita esses dois valores), então um resgate pela aba no Grão-Pará aparece como Playground.
- **Sem backfill:** em 23/10/2026 não havia cadastro nem cupom `ESPERA` em nenhuma unidade. Cadastros feitos antes do deploy do webhook não terão o cupom do Grão-Pará.

Aplicado em produção em 23/10/2026: migração (registrada no Supabase como `wifi_cupom_grao_para`), `wifi-lead-webhook` v32 e `behavior-test-admin` v42, ambos com `verify_jwt` desligado. Falta o site (`admin.html`, que traz o rótulo "Playground Grão-Pará" na aba). Ordem seguida: (1) migração `20261023120000_wifi_cupom_grao_para.sql`; (2) deploy de `wifi-lead-webhook` e `behavior-test-admin` (`--no-verify-jwt`); (3) site. A migração vai primeiro porque, sem as colunas novas, o `update` final do cadastro no webhook falha (e com ele o registro de `email_sent_at` e das sincronizações) e a listagem da aba Cupons Wi-Fi devolve erro.

## Lote 12: um cupom Wi-Fi por cliente a cada 30 dias, 24/10/2026 (pendente, feito só no código)

- **Regra.** `wifi-lead-webhook` só emite cupom `ESPERA-XXXX` se não houver cadastro dos últimos 30 dias com o mesmo WhatsApp (com ou sem o 9º dígito), o mesmo e-mail (em minúsculas) ou o mesmo MAC válido. Os 30 dias contam da emissão do cupom anterior (`created_at`), não do vencimento (15 dias) nem do uso. Nesse intervalo o Wi-Fi libera normalmente, mas não nasce cupom, cupom no caixa nem e-mail: o cadastro existente só ganha uma visita (`visit_count`).
- **Antes** só o mesmo MAC, e só enquanto o cupom estava valendo, era reconhecido. Passados os 15 dias, o mesmo aparelho recebia outro cupom, e outro celular, e-mail ou número recebia um novo a cada visita.
- **Resposta igual** nos dois casos (`{"ok":true}`), para ninguém descobrir, digitando um telefone ou e-mail, se a pessoa usou o Wi-Fi da clínica. O tempo de resposta ainda difere, porque o cadastro novo envia e-mail.
- **MAC sem trocar** (`$(mac)` literal) ou vazio não é usado para reconhecer ninguém, e o cadastro grava `mac` nulo.
- **Cadastro com falha no e-mail** (`email_error`) não conta: a pessoa nunca recebeu o cupom e pode tentar de novo.
- **Páginas:** `hotspot/login.html` ganha a regra no rodapé do formulário. `hotspot/alogin.html` e `wifi.html` deixam de calcular uma data de validade no navegador (ela estaria errada para quem já recebeu) e passam a dizer "vale por 15 dias · 1 por cliente a cada 30 dias". O e-mail do cupom também cita a regra.
- **Sem migração** (os índices de telefone, e-mail e MAC já existem). Ordem: (1) deploy de `wifi-lead-webhook` (`--no-verify-jwt`); (2) site; (3) copiar `login.html` e `alogin.html` para o roteador.
- **Limites conhecidos.** Quem usa outro telefone, outro e-mail e outro aparelho recebe outro cupom; só a recepção percebe. Dois cadastros simultâneos do mesmo cliente podem emitir dois cupons.

## Lote 13: TV da sala de espera da Clínica (/tv3) e página /familia, 25/10/2026 (pendente, feito só no código)

Só o site: nada de migration, função ou secret. Arquivos novos: `familia.html` (rewrite em `vercel.json`),
`conteudo/tv3-slides.json` e `conteudo/tv3-roteiro-slides.md` (fora do ar pelo `.vercelignore`), `scripts/tv3-*.{py,mjs}`,
`PLANO-TV3.md` e `EXPERIMENTOS-TV3.md`. O `tv3.html` foi reescrito (motor de voltas, QR local, trilha instrumental).

1. Antes de ligar a TV, cumprir o checklist de instalação do `PLANO-TV3.md` (celular do responsável cadastrado na avaliação,
   SMS do Portal funcionando, cartão de mesa, resposta da recepção sobre o benefício). Enquanto faltar, usar `?portal=0`.
2. A Isabella revisa os slides marcados [ISABELLA] em `conteudo/tv3-roteiro-slides.md`.
3. Na TV, abrir `/tv3` (deitada: `/tv3?rot=90`), tela cheia, e deixar. Chrome em modo quiosque com
   `--autoplay-policy=no-user-gesture-required` para a trilha tocar sem clique.
4. Mudar texto ou QR: ver "Como mudar um texto" no `PLANO-TV3.md`.

## Lote 14: Wi-Fi sem cupom por e-mail, só o Mural emite, 03/11/2026 (pendente: banco, função e site)

- **Regra.** O cadastro do portal Wi-Fi deixa de gerar cupom `ESPERA-XXXX`, de criar cupons no caixa e de enviar e-mail. Quem emite cupom é só `wifi-mural-coupon`, para o responsável cadastrado no Mural da Família. Quem não é cliente não recebe cupom, nem por e-mail.
- **`wifi-lead-webhook`** só grava o lead (consentimento, opt-ins, UTM, MAC) e soma visitas dentro de 30 dias. A deduplicação ignora linhas do Mural (`source = 'mural'`). A resposta continua igual para cadastro novo e repetido.
- **Migração** `20261103120000_wifi_cadastro_sem_cupom.sql`: `coupon_code`, `coupon_status` e `coupon_expires_at` passam a aceitar nulo.
- **`behavior-test-admin`**: a aba Cupons Wi-Fi lista só linhas com cupom; o resumo conta todos os cadastros, e as métricas de cupom (resgate, vigentes, vencidos, taxa) consideram só linhas com cupom.
- **Textos:** `wifi.html`, `hotspot/alogin.html` e `hotspot/logout.html` trocam "Seu cupom está no seu e-mail" por "Cliente da clínica? Seu cupom está no Mural da Família". Falta copiar `alogin.html` e `logout.html` para o roteador.
- **Ordem:** (1) migração 20261102120000 (já aplicada, se o Mural já emite) e depois 20261103120000; (2) deploy de `wifi-lead-webhook` (`--no-verify-jwt`) e `behavior-test-admin`; (3) site; (4) roteador. Deploy da função antes da migração faz o cadastro falhar (500) por causa do `coupon_code` nulo.
- **Fora desta mudança:** e-mail de produto no lugar do cupom (nenhum definido) e o campo de e-mail do `login.html`, que continua obrigatório.

## Lote 15: Manutenção TI no Hub de Gestão, 08/11/2026 (pendente: banco, arquivos, função e site)

- **O que muda.** O script de otimização do Windows 11 e o texto de comandos saem da pasta pública `/fa7k2m9` e passam a um bucket privado `ti-arquivos`. Só `owner` vê o card "Manutenção TI" no Hub e baixa, por link assinado de 60 s (ações `ti_listar` e `ti_baixar` do `gestao-hub`). Cada download grava `ti_download` na auditoria. Os papéis de parede foram excluídos do repositório.
- **Fonte dos arquivos:** `supabase/ops/ti/`. Ao mudar o `.ps1` ou o `.txt`, atualize `tamanho_bytes` e `sha256` no catálogo `ARQUIVOS_TI` do `gestao-hub` (o teste "tamanho e SHA256 do catálogo batem com os arquivos reais" avisa) e envie o arquivo novo ao bucket.
- **Ordem:** (1) migração `20261108120000_ti_arquivos_bucket.sql`; (2) enviar `supabase/ops/ti/otimizar-win11.ps1` e `supabase/ops/ti/comandos-otimizar.txt` ao bucket `ti-arquivos` pelo painel do Supabase, com esses nomes exatos; (3) conferir `select public from storage.buckets where id = 'ti-arquivos'` = `false`; (4) deploy de `gestao-hub` (`--no-verify-jwt`); (5) site. Se o site subir antes do passo 2, o card abre mas o download dá erro.
- **Teste:** como owner, abrir Manutenção TI, baixar os 2 arquivos e conferir o SHA256 mostrado na tela com `Get-FileHash`; como gerente, confirmar que o card não aparece e que chamar `ti_baixar` direto na API dá 403; abrir `institutofacaamigos.com.br/fa7k2m9/otimizar-win11.ps1` e cair no login do Hub.
- **Atenção:** `/fa7k2m9` agora redireciona (301) para o Hub, e quem usava a URL antiga (atalho, impresso) não baixa mais. O ZIP dos papéis de parede e o script antigo continuam no histórico do git. Se isso for sensível, reescrever o histórico é um passo separado.
