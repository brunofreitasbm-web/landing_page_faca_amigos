# Recadastro de identidade (Fase 2b): CPF e e-mail real

Data: 2026-11-08. Repositório principal: `landing_page_faca_amigos` (Hub de Gestão). Toca também `clinica_facaamigos` e `grupo_ib_rh`.
Contexto: Fase 2b da unificação de identidade (Hub como IdP). Fases 0 e 1 já estão no ar (#139, #140).

## Objetivo

Cada pessoa que hoje entra na Clínica, no RH (supervisores) ou no Hub informa **CPF e e-mail real**, confirmado por código enviado a esse e-mail. O sistema guarda essa identidade e a liga às contas que a pessoa já tem, **sem perder nenhuma permissão** e sem mudar a forma de login.

## Decisões já tomadas (do dono)

- Quem tem login atual, com e-mail real ou fictício, é levado à página de recadastro ao acessar o sistema.
- **Prazo de 7 dias**: nos primeiros 7 dias a página tem "Fazer depois". Depois disso, bloqueia até concluir.
- O portal da família não muda. Contas de quiosque (`*_unit`), PIN do balcão e famílias ficam de fora.
- O recadastro só **coleta e vincula**. Não cria conta no Hub, não mexe em papel nem em permissão, não troca o login (isso é a Fase 2).

## Fora do escopo

Login por CPF no Hub, aparelho confiável, criação de contas no Hub a partir de contas da clínica ou do RH, mapeamento de papel nativo para nível do Hub, fusão automática de contas duplicadas, WhatsApp.

## Quem entra e como é identificado

Duas origens de identidade, ambas já autenticadas antes do recadastro:

1. **Login nativo da Clínica ou do RH** (projeto Supabase B, `vththexblpxwocbowhsv`, Auth compartilhado pelos dois). O sistema pede ao Hub um **código de uso único** enviando o token de acesso da pessoa. O Hub valida esse token no projeto B (`auth.admin.getUser`, com a chave de serviço que o Hub já tem em `CLINICA_SUPABASE_SERVICE_ROLE_KEY`). O token nunca vai na URL.
2. **Login do Hub** (conta em `fa_gestao_contas`, sessão `fa_gestao_sessoes`). A página abre direto, com a sessão do Hub.

Ficam fora do recadastro: papel `*_unit` ou `intern`, `profiles.role = 'responsavel'`, usuários banidos ou inativos.

## Dados (projeto A, tudo aditivo e idempotente)

- `fa_gestao_pessoas`: `cpf text primary key` (só dígitos, validado por `cpfValido`), `email_real text not null`, `nome text`, `confirmado_em timestamptz`.
- `fa_gestao_pessoa_contas`: `cpf` (FK), `origem text` (`clinica` | `rh` | `hub`), `auth_user_id uuid null` (projeto B), `hub_email text null`, `email_login_antes text`, `criado_em`. Chave única em `(origem, auth_user_id)` e em `(origem, hub_email)`.
- `fa_gestao_recadastro_estado`: `chave text primary key` (`b:<auth_user_id>` ou `hub:<email>`), `primeiro_aviso_em timestamptz`, `concluido_em timestamptz null`, `adiado_em timestamptz null` (último "Fazer depois"; dentro do prazo, por 12 horas o status responde `pendente:false` para a página não reabrir a cada carga).
- `fa_gestao_recadastro_tickets`: `ticket_hash`, `chave`, `origem`, `expira_em` (2 minutos), `usado_em`, `voltar_host` (só origem `rh`: o host de onde a pessoa veio, aceito só se for `rh.institutofacaamigos.com.br` ou `porto-terapia-gestao.vercel.app`; monta o `voltar_url`).
- `fa_gestao_recadastro_conflitos`: `id`, `chave`, `motivo` (`cpf_de_outra_pessoa` | `email_de_outro_login`), `cpf_informado`, `email_informado`, `criado_em`, `resolvido_em`.
- `fa_gestao_desafios`: a constraint `finalidade in ('login','reset')` passa a aceitar também `'recadastro'`. O código de 6 dígitos reaproveita `conferirCodigo`, que já limita tentativas.
- Todas com RLS ligado e sem policy (só a service role, como as demais `fa_gestao_*`).

## Ações do Hub (`gestao-hub`)

| Ação | Quem chama | O que faz |
|---|---|---|
| `recadastro_status` | sistema (Bearer = token do projeto B) ou Hub (sessão) | Devolve `{pendente, bloquear, dias_restantes}`. Cria `primeiro_aviso_em` no primeiro aviso. Se o recurso estiver desligado ou a pessoa for isenta, devolve `pendente:false`. |
| `recadastro_ticket` | sistema (Bearer = token do projeto B) | Valida o token, gera código de uso único (hash, 2 min) e devolve a URL `…/#recadastro&c=<código>`. |
| `recadastro_consultar` | página | Consome o ticket ou usa a sessão do Hub e mostra nome e dias restantes. Nunca devolve CPF nem e-mail já cadastrados. |
| `recadastro_enviar_codigo` | página | Recebe CPF e e-mail, valida CPF, checa conflitos e envia o código de 6 dígitos ao e-mail informado, via Brevo. |
| `recadastro_confirmar` | página | Confere o código (máx. 5 tentativas, 10 min) e aplica a confirmação. Responde `{ok, login_trocado}`; `login_trocado` (booleano) faz a página orientar a entrar com o CPF ou com o e-mail confirmado. |
| `recadastro_adiar` | página | Só dentro dos 7 dias. Registra o adiamento e segue. |
| `recadastro_painel` (owner) | Hub | Lista quem concluiu, quem está pendente e os conflitos abertos. |
| `recadastro_resolver` (owner) | Hub | Dá baixa num conflito depois de resolvido à mão. |

Todas as ações respondem `pendente:false` e não fazem nada quando o recurso está desligado.

## O que a confirmação grava

1. **Tudo ou nada.** Se qualquer verificação de conflito falhar, nada é gravado e o caso entra em `fa_gestao_recadastro_conflitos`.
2. Grava `fa_gestao_pessoas` e `fa_gestao_pessoa_contas`.
3. **Conta com e-mail fictício** (`@staff.facaamigos.local`, `@grupoib.internal`): troca o e-mail do login pelo real com `auth.admin.updateUserById`, **mantendo o mesmo `id`**. Guarda o e-mail antigo em `email_login_antes` para reverter.
4. **Conta que já tem e-mail real: o e-mail do login não muda.** Motivo: o RH entra por nomes fixos ligados a e-mails fixos em `src/config/branding.js` (`bruno`, `isabella` etc.), e trocar esses e-mails quebraria o login. O e-mail confirmado fica guardado como contato em `fa_gestao_pessoas`.
5. **Clínica:** preenche `profiles.cpf` (índice único parcial já existente) só quando está vazio, e `profiles.email` quando mudou o e-mail do login. Perfil que já tem **outro** CPF: conflito `cpf_de_outra_pessoa`, nada gravado. O mesmo CPF já gravado (com ou sem máscara) fica como está.
6. **Hub (`fa_gestao_contas`):**
   - **Vindo da Clínica ou do RH (login nativo do projeto B), nada é escrito na conta do Hub**, nem `cpf` nem `email_codigo`, mesmo que a conta esteja ligada a esse login (por `email`, `login_email`, `clinica_email` ou `rh_email`). Motivo de segurança: a senha de outro sistema não prova posse do CPF informado nem do canal de código do Hub (`email_codigo` é o segundo fator do login e o destino do "esqueci a senha"); quem tivesse só a senha da Clínica ou do RH assumiria a conta do Hub. O CPF e o e-mail confirmados ficam em `fa_gestao_pessoas`, `fa_gestao_pessoa_contas` e `profiles`.
   - A conta do Hub ligada é só **lida**: se já tem **outro** CPF, abre conflito `cpf_de_outra_pessoa` e nada é gravado (tudo ou nada).
   - **Vindo do próprio Hub (sessão da conta):** a conta da sessão recebe o `cpf` se estiver vazio (**nunca sobrescreve** CPF preenchido; outro CPF é conflito). O `email_codigo` só muda quando está **vazio, é fictício** (mesma lista de domínios fictícios do login) **ou é igual ao e-mail da própria conta**; senão fica intacto e o e-mail confirmado fica só como contato. Outras contas do Hub não são tocadas.
   - A chave `email` da conta **não é renomeada**.
7. **RH:** não escreve em `app_metadata` (papel e escopo ficam intocados).
8. Marca `concluido_em` e grava a auditoria `recadastro_concluido`.

## Conflitos (sem fusão automática)

- CPF já ligado a **outra** pessoa (ou `profiles.cpf` já usado por outro perfil): bloqueia e abre conflito `cpf_de_outra_pessoa`.
- E-mail real já em uso por **outro** login no mesmo projeto: bloqueia e abre conflito `email_de_outro_login`.
- A pessoa vê só "não foi possível concluir, o responsável foi avisado". Nenhum dado de terceiros aparece.
- O conflito é sempre gravado: se a checagem de conflito aberto igual (para não duplicar) falhar, grava assim mesmo.
- Dentro dos 7 dias a pessoa continua entrando normalmente. Depois do prazo, o conflito não pode trancá-la: enquanto houver conflito aberto, ela fica **liberada** e a fila do owner mostra o caso.

## Prazo e bloqueio

- `primeiro_aviso_em` nasce na primeira consulta. Dias restantes = 7 menos os dias desde essa data.
- Passados os 7 dias e sem conclusão, `bloquear:true`: o sistema leva à página de recadastro sem o botão "Fazer depois".
- **Exceção ao bloqueio:** quem tem um conflito aberto (seção anterior) nunca é bloqueado, porque o impasse não é culpa da pessoa. `recadastro_status` devolve `bloquear:false` enquanto houver conflito sem baixa.
- **Se o Hub não responder, nunca bloqueia.** O sistema trata falha de rede ou erro como "sem pendência".
- **Erro de leitura do estado nunca deixa pendente.** Se o Hub não consegue ler ou criar o estado, `recadastro_status`, `me` e o login respondem `pendente:false` (e não gravam nada). Na página, no modo Hub, qualquer falha de `recadastro_consultar` que não seja sessão vencida segue para o painel; só quem já está bloqueado vê "Tentar de novo" e "Sair".
- **Conta do Hub com CPF preenchido conta como concluída.** O CPF só entra na conta do Hub pelo recadastro feito com a sessão do Hub (ou pelo owner). Consequência: quem concluiu só pela Clínica ou pelo RH continua pendente na chave `hub:` e faz o recadastro uma vez no Hub.

## Integração nos três sistemas

- **Clínica** (`lib/supabase/middleware.ts`, no mesmo ponto da troca de senha obrigatória): após o login, `signIn` chama `recadastro_status` e grava um cookie curto (`fa_recad`, 12 h). O middleware lê o cookie, sem chamar o Hub a cada página. Se pendente, redireciona via `recadastro_ticket` para a página do Hub. Isenta `/login`, `/trocar-senha`, rotas públicas e o portal da família.
- **RH** (`src/App.jsx`, `handleSession`, só `role === 'supervisor'`): consulta o status e, se pendente, abre a página do Hub com o código de uso único. Quiosques e estagiário nominal ficam de fora.
- **Hub:** após o login, se a conta não tem CPF, abre `#recadastro` com a sessão do Hub.
- **Página** `gestao.html#recadastro`: campos CPF e e-mail real, código de 6 dígitos, botão "Fazer depois" (só nos 7 dias), mensagens sem revelar dados de terceiros. Funciona a 390 px de largura. Vindo de um sistema, depois de concluir ou de "Fazer depois" mostra "Voltar ao sistema", cujo endereço só é usado se for https e de um host da lista fixa da página (Clínica e os dois do RH). No modo Hub, quem está bloqueado tem o botão "Sair".
- **Chaves de liberação, desligadas por padrão:** `GESTAO_RECADASTRO` (Hub), `GESTAO_RECADASTRO` (Clínica) e `VITE_GESTAO_RECADASTRO` (RH). Ligar e desligar não exige novo deploy de código, só da configuração.

## Segurança

- Código de uso único: 2 minutos, 1 uso, só o hash no banco. O token de acesso nunca vai em URL.
- Código por e-mail: só o hash, 5 tentativas, 10 minutos. Limite de pedidos por pessoa e por IP, reaproveitando `excedeuTentativas`.
- Ninguém muda o CPF depois de confirmado. Só o owner, pela fila de conflitos.
- Auditoria: `recadastro_ticket`, `recadastro_codigo_enviado`, `recadastro_concluido`, `recadastro_conflito`, `recadastro_adiado`.
- Mensagens de erro genéricas, para não permitir descobrir quem tem qual CPF ou e-mail.

## Implantação e reversão

1. Migrations (`20261109120000_gestao_recadastro.sql` e `20261109130000_gestao_recadastro_voltar_host.sql`, antes do Hub) e Hub publicados com `GESTAO_RECADASTRO` desligada: nada muda para ninguém.
2. Ligar no Hub e testar com o owner.
3. Publicar a clínica e ligar a chave. Acompanhar o painel.
4. Publicar o RH e ligar a chave.
5. **Reversão:** desligar a chave devolve o comportamento anterior. Para desfazer um e-mail trocado, `email_login_antes` guarda o valor de antes.

## Testes

- **Hub (`deno test`, fake do Supabase):** ticket expira e é de uso único; token de outro projeto ou de quiosque é recusado; CPF inválido; conflito de CPF e de e-mail não gravam nada; e-mail fictício é trocado mantendo o `id`; e-mail real não é trocado; conta do Hub recebe CPF sem renomear a chave (só pela sessão do Hub; vindo da Clínica/RH a conta do Hub fica intacta); prazo de 7 dias (dia 6 adia, dia 8 bloqueia); Hub fora do ar não bloqueia; recurso desligado não faz nada; código errado 5 vezes bloqueia.
- **Clínica (`npm test`):** função pura que decide o redirecionamento a partir do status e do cookie.
- **Navegador (Playwright, API simulada):** página de recadastro em 390 px, fluxo completo, botão "Fazer depois" some depois do prazo.
- **Antes de ligar em produção:** consulta somente leitura para listar conflitos esperados (CPF repetido, e-mail repetido).

## Riscos e pontos abertos

- Um login da Clínica ou do RH prova só a senha dele, não a posse do CPF informado. O CPF vindo dessas origens fica em `fa_gestao_pessoas` e `profiles.cpf` sem prova de identidade: alguém pode reservar o CPF de outra pessoa (vira conflito `cpf_de_outra_pessoa` na fila do owner, sem bloquear ninguém). A Fase 2 (login por CPF) não pode tratar `fa_gestao_pessoas` vindo dessas origens como prova de identidade.
- Quando o `email_codigo` de uma conta do Hub muda pela sessão do próprio Hub, o endereço antigo não é avisado (melhoria futura).
- Troca de e-mail do login em contas fictícias é a única alteração em dado de acesso existente. Fica atrás da chave e é reversível por `email_login_antes`.
- A clínica tem hoje 9 perfis com e-mail fictício e só 4 com CPF. O RH tem 10 supervisores com e-mail real. O Hub tem 6 contas, nenhuma com CPF. Os números pequenos permitem acompanhar caso a caso.
- A `sync-grupoib-professional` pode recriar `profiles.email` de pessoas sincronizadas do Grupo IB. Hoje ela só grava o e-mail na criação do perfil. Se isso mudar, o recadastro pode ser sobrescrito.
- Pessoas com acesso à clínica e ao RH usam o mesmo usuário no projeto B. O recadastro é feito uma vez e vale para os dois.
