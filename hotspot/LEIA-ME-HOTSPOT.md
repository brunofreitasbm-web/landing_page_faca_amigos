# Portal Wi-Fi da Clínica — MikroTik hEX S

Guia de instalação dos arquivos desta pasta no roteador e configuração mínima do RouterOS
para o hotspot funcionar como o plano de marketing prevê. Ver o plano completo em
`C:\Users\bruno\.claude\plans\mikrotik-hex-s-roteador-snazzy-rivest.md`.

## O que tem aqui

| Arquivo | Papel |
|---|---|
| `login.html` | Tela de cadastro (nome, WhatsApp, e-mail, LGPD, opt-in) — é o gate de marketing |
| `md5.js` | Suporte a CHAP-MD5, exigido pelo `login.html` |
| `alogin.html` | Tela pós-login — cupom, benefícios, CTAs, A/B, segmentação por horário |
| `status.html` | Reexibida quando o visitante já está logado e reabre o portal |
| `logout.html` | Tela de despedida |
| `error.html` + `errors.txt` | Erros traduzidos, com a voz da marca |
| `rlogin.html` | Redirect para o `login.html`, servido pelo RouterOS a quem ainda não entrou e abriu um site fora do walled garden |
| `logo.png` | Logo local — funciona mesmo antes do walled garden liberar CDNs externas |

## Importante: como funciona o "cadastro obrigatório" aqui

O RouterOS autentica hotspot por usuário/senha (ou RADIUS). Criar um usuário por família
exigiria RADIUS ou scripts complexos. Este portal usa a abordagem padrão do mercado para
esse cenário: **uma conta compartilhada de visitante** (`visitante` / `visitante`, com
`shared-users` alto) libera a internet de verdade, e o **gate de marketing** — o que faz
o cadastro ser obrigatório na prática — é o formulário do `login.html`: ele só envia o
usuário/senha compartilhados para o roteador *depois* de validar nome, WhatsApp, e-mail e
o aceite de LGPD, e só então grava o lead no backend. Ou seja: sem preencher o formulário,
a família não vê o botão de submeter a conta de visitante. Documento isso explicitamente
para não gerar expectativa de autenticação forte por família — se no futuro for necessário
(ex.: cobrança, RADIUS corporativo), o formulário pode ser adaptado sem tocar no visual.

> **Segurança (21/09/2026):** a pasta `hotspot/` não é mais publicada no site (`.vercelignore` e `robots.txt`); ela só vai
> para o roteador. A senha `visitante` fica dentro do `login.html` por desenho (é a conta compartilhada de visitante),
> então **troque `visitante`/`visitante` por credenciais próprias no RouterOS e em `login.html` antes de instalar**, e
> nunca reutilize essa senha em outro lugar.

## 1. Upload dos arquivos

Via WinBox → Files, ou FTP:

```
/flash/hotspot/login.html
/flash/hotspot/md5.js
/flash/hotspot/alogin.html
/flash/hotspot/status.html
/flash/hotspot/logout.html
/flash/hotspot/error.html
/flash/hotspot/errors.txt
/flash/hotspot/rlogin.html
/flash/hotspot/logo.png
```

Ou copie a pasta `hotspot/` inteira para dentro de `flash/hotspot/` mantendo os nomes.

## 2. Rede: isolar visitantes da rede administrativa

**Não coloque o hotspot na mesma rede dos computadores da clínica.** Prontuário e dados
de paciente não podem estar na mesma LAN de um visitante anônimo.

Este guia parte de um hEX S com a **configuração padrão de fábrica**: ether1 é a internet,
ether2 a ether5 estão na `bridge`, a LAN é 192.168.88.0/24 e existem as regras `defconf`.
Se o roteador foi zerado sem ela, veja a nota no fim desta seção.

### 2.1 Portas e DHCP dos visitantes

```
/interface bridge add name=bridge-visitantes
/interface bridge port set [find interface=ether2] bridge=bridge-visitantes
/interface bridge port set [find interface=ether3] bridge=bridge-visitantes
;; ether2 e ether3 são exemplos: use as portas onde estão os access points.
;; As outras portas continuam na LAN da clínica. Use "set", não "add": na
;; configuração de fábrica as portas já pertencem à bridge padrão e o "add" falha.

/ip pool add name=pool-visitantes ranges=192.168.20.10-192.168.20.250
/ip address add address=192.168.20.1/24 interface=bridge-visitantes
/ip dhcp-server add name=dhcp-visitantes interface=bridge-visitantes address-pool=pool-visitantes disabled=no
/ip dhcp-server network add address=192.168.20.0/24 gateway=192.168.20.1 dns-server=192.168.20.1
```

Os access points existentes ficam em **modo bridge** — só repassam Wi-Fi para essa rede,
sem autenticar nada por conta própria.

### 2.2 Firewall: separar em bridges não isola nada sozinho

O roteador **roteia** entre as duas redes. Sem regra, um visitante já logado alcança os
computadores da clínica. Estas regras fecham isso e liberam só o que o portal precisa:

```
/ip firewall filter
add chain=forward in-interface=bridge-visitantes out-interface-list=!WAN action=drop \
    comment="visitantes so saem pela internet" \
    place-before=[find where comment="defconf: drop all from WAN not DSTNATed"]
add chain=input in-interface=bridge-visitantes protocol=udp dst-port=53,67 action=accept \
    comment="visitantes: DNS e DHCP" \
    place-before=[find where comment="defconf: drop all not coming from LAN"]
add chain=input in-interface=bridge-visitantes protocol=tcp dst-port=53 action=accept \
    comment="visitantes: DNS tcp" \
    place-before=[find where comment="defconf: drop all not coming from LAN"]
```

- A primeira regra impede que visitantes falem com qualquer rede que não seja a internet.
- As outras duas ficam **antes** da regra padrão que derruba tudo que não vem da LAN. Essa
  regra padrão, mantida no fim, também bloqueia Winbox, SSH e Webfig para os visitantes.
- Se o `place-before` der erro, o texto do comentário na sua versão é diferente. Rode
  `/ip firewall filter print`, confira o comentário exato e ajuste.
- A regra de NAT padrão (`out-interface-list=WAN`) e o `allow-remote-requests=yes` do DNS já
  existem na configuração de fábrica e atendem os visitantes. Não precisa criar nada.
- **Se o roteador foi zerado sem a configuração padrão**, você precisa criar por conta própria:
  a lista de interfaces `WAN` com a porta da internet (`ether1`, ou `pppoe-out1` se a operadora
  usa PPPoE), o NAT `masquerade` com `out-interface-list=WAN`, `/ip dns set
  allow-remote-requests=yes` e uma regra final que derruba a entrada vinda de fora da LAN. As
  regras acima, sem `place-before`, entram no fim da cadeia.

## 3. Criar o hotspot

```
/ip hotspot profile add name=hsprof-facaamigos hotspot-address=10.20.0.1 \
    html-directory=flash/hotspot login-by=cookie,http-chap,http-pap \
    http-cookie-lifetime=30d use-radius=no

/ip hotspot add name=hotspot-clinica interface=bridge-visitantes \
    address-pool=pool-visitantes profile=hsprof-facaamigos disabled=no
```

- `login-by` precisa incluir `cookie`. Sem isso o RouterOS nunca usa o cookie e a reconexão
  automática da seção 5 não funciona.
- `http-cookie-lifetime` é propriedade do **perfil do servidor** (`/ip hotspot profile`), não do
  perfil de usuário. O padrão é 3 dias; aqui são 30.

O assistente `/ip hotspot setup` faz isso de forma guiada, se preferir — só aponte
`html-directory` para `flash/hotspot` ao final e confira `login-by` e `http-cookie-lifetime`.

**Endereço do portal:** o RouterOS serve o `login.html` no IP da interface do hotspot, na
rota `/login` (sem `.html`). Com a rede acima, a página de login é
`http://192.168.20.1/login`. Em condições normais ninguém digita isso — o celular abre o
portal sozinho ao conectar — mas é o endereço para testar manualmente, e é a confirmação
de que 192.168.20.1 pertence à `bridge-visitantes`, não à LAN administrativa.

## 4. Conta compartilhada de visitante + perfil de sessão

```
/ip hotspot user profile add name=up-visitantes shared-users=254 \
    session-timeout=1h idle-timeout=15m keepalive-timeout=none \
    status-autorefresh=1m transparent-proxy=no

/ip hotspot user add name=visitante password=visitante profile=up-visitantes
```

- `session-timeout=1h` — cada visita renova a exibição do `alogin.html` (proposta 8 do plano).
- `shared-users=254` — permite todas as famílias conectadas ao mesmo tempo usarem a mesma conta.

## 4.1 Controle de banda

Objetivo: nenhum aparelho de visitante consegue encher o link e atrapalhar o que a clínica usa
(prontuário online, caixa, telemedicina). Dois níveis: um **teto para a rede de visitantes inteira**
e um **limite por aparelho**.

**Plano contratado: 600 Mbps de download.** A taxa de upload do plano é diferente e ainda não foi
informada. A conta abaixo **assume 300 Mbps de upload** (metade do download). Confirme na fatura ou
no contrato e refaça só a coluna de upload.

| | Download | Upload |
|---|---|---|
| Plano contratado | 600 Mbps | U (assumido: 300 Mbps) |
| Rede de visitantes, 50% do plano | 300 Mbps | 0,5 × U (assumido: 150 Mbps) |
| Sobra para a clínica | 300 Mbps | 0,5 × U (assumido: 150 Mbps) |
| Parte justa por aparelho, com 30 no pico | 300 ÷ 30 = 10 Mbps | 150 ÷ 30 = 5 Mbps |
| Limite por aparelho, 2× a parte justa | 20 Mbps | 10 Mbps |

O limite por aparelho vale o dobro da parte justa para que poucos aparelhos aproveitem a
capacidade ociosa. No pico, o teto da rede divide o que sobra. O "30 no pico" é uma estimativa:
troque pelo maior número que `/ip hotspot active print count-only` mostrar num dia cheio.

```
/queue simple add name=visitantes-total target=10.20.0.0/24 max-limit=150M/300M \
    comment="teto da rede de visitantes: 50% do plano"

/ip hotspot user profile set up-visitantes \
    rate-limit="10M/20M 20M/40M 7M/15M 10s/10s" \
    parent-queue=visitantes-total
```

- Em `rate-limit` e em `max-limit`, o primeiro número de cada par é **upload** do aparelho e o
  segundo é **download**. Aqui: 10M sobe e 20M desce, com rajada de 20M/40M para abrir páginas
  rápido. A MikroTik define "rx" como o upload do cliente e "tx" como o download.
- Como a conta `visitante` é compartilhada, o RouterOS cria **uma fila por aparelho** (por sessão),
  então o limite vale para cada celular e não para todos juntos. O teto de todos juntos é a fila
  `visitantes-total`.
- A fila `visitantes-total` precisa existir **antes** do `parent-queue`, senão o comando falha.

### O hEX S aguenta?

O teste oficial da MikroTik para o hEX S, roteando com 25 filas simples, dá 1391 Mbps com pacotes
de 1518 bytes e 488 Mbps com pacotes de 512 bytes. Com 25 regras de firewall, dá 766 e 265 Mbps.
São testes de laboratório, sem hotspot, NAT e rastreamento de conexão, então o desempenho real
fica abaixo disso. Os 300 Mbps de visitantes cabem nesses números, mas **só a medição confirma**:
rode um teste de velocidade num celular logado com a clínica em uso e olhe a CPU em
`/system resource print`. Se o teste mostrar menos que o contratado, recalcule sobre o que o link
entrega de fato.

### FastTrack desliga o controle de banda

A regra padrão de FastTrack faz o tráfego marcado por ela **ignorar as filas**, e o limite não
funciona. Exclua a rede de visitantes dela:

```
/ip firewall filter print where action=fasttrack-connection
/ip firewall filter set [find action=fasttrack-connection] \
    src-address=!10.20.0.0/24 dst-address=!10.20.0.0/24
```

Se o primeiro comando não listar nada, não há o que fazer.

### Aplicar e conferir

O limite só vale para sessões novas. Para derrubar as atuais e forçar novo login:

```
/ip hotspot active remove [find]
```

Conecte um celular, faça o cadastro e rode um teste de velocidade. Depois confira:

```
/queue simple print stats
/ip hotspot active print
```

Deve aparecer a fila `visitantes-total` e, durante a sessão, uma fila dinâmica para o aparelho.

### O que NÃO usar

- **`limit-bytes-total` e `limit-uptime` no usuário `visitante`.** Esses contadores são da conta, não
  do aparelho. Como todo mundo usa a mesma conta, o primeiro que baixar muito corta a internet de
  todos. O controle de tempo por aparelho já é o `session-timeout=1h` do perfil.
- **Limite sem teto na rede.** Só o limite por aparelho não protege a clínica quando há muitos
  aparelhos ao mesmo tempo. Use sempre os dois.

## 5. Reconexão automática (cookie do navegador)

Para não mostrar o formulário de novo a quem já se cadastrou, o RouterOS grava um cookie HTTP no
primeiro login e, enquanto ele valer, autentica o aparelho sozinho. Isso depende de duas coisas,
as duas no **perfil do servidor** e já feitas na seção 3: `cookie` em `login-by` e
`http-cookie-lifetime`. O perfil de usuário não tem essa propriedade.

**Limites que a documentação da MikroTik não resolve, então teste:**

- O cookie fica no navegador. Se o mini-navegador do captive portal (o que abre sozinho no
  celular) não guardar cookies entre uma conexão e outra, o aparelho verá o formulário de novo.
  O teste 5 existe para descobrir isso.
- A documentação não diz qual tela aparece depois do login por cookie. Confira no teste se o
  `alogin.html` com a oferta aparece de novo.

**Plano B: `mac-cookie`.** Se o teste 5 falhar, troque o `login-by` por
`mac-cookie,cookie,http-chap,http-pap`. O roteador passa a reconhecer o aparelho pelo MAC e o
libera sem mostrar tela nenhuma. O custo: o `alogin.html` deixa de aparecer na volta, e a proposta 8
(oferta renovada a cada sessão) deixa de valer para quem volta. O prazo é o `mac-cookie-timeout`
do perfil de usuário, padrão 3 dias.

O `rlogin.html` **não faz parte dessa reconexão**. O RouterOS serve esse arquivo a quem ainda não
entrou e abriu um site fora do walled garden, e a função dele é só mandar para o `login.html`.

## 6. Walled garden — o que precisa estar liberado ANTES do login

Só entra aqui o que as telas **anteriores ao login** usam. Conferido nos arquivos desta pasta:

- `login.html` chama o Supabase para gravar o lead e linka a Política de Privacidade em
  `institutofacaamigos.com.br`. Isso precisa passar.
- Fontes do Google, Tag Manager, WhatsApp e Instagram só aparecem em `alogin.html`,
  `status.html` e `logout.html`, que o visitante vê **depois** de logado, quando já tem internet
  completa. Não liberar.

```
/ip hotspot walled-garden add dst-host=ivjvpdzsfjdpyabbzzuj.supabase.co action=allow \
    comment="login.html grava o lead"
/ip hotspot walled-garden add dst-host=institutofacaamigos.com.br action=allow \
    comment="link da Politica de Privacidade"
```

Cada domínio liberado aqui é acesso à internet **sem** login. Por isso o Supabase entra pelo
endereço exato do projeto, e não por `*.supabase.co`, que liberaria qualquer projeto de qualquer
pessoa. A Política de Privacidade abre sem as fontes do Google e sem o Tag Manager antes do login.
Ela funciona, só fica com a fonte padrão. Não adicione domínios "por garantia".

**Como isso funciona e onde pode falhar.** Segundo a MikroTik, este menu vale para HTTP e HTTPS.
Para HTTPS, o roteador casa o nome com o IP que o aparelho resolveu pelo **DNS do próprio
roteador**. Duas consequências:

- O aparelho precisa usar o DNS do roteador. O DHCP da seção 2 entrega `10.20.0.1`. Um aparelho
  com DNS privado fixo no celular pula o roteador e o walled garden não o reconhece.
- Sites que trocam de IP com muita frequência podem falhar. É um relato da comunidade MikroTik, não
  da documentação. Como o `login.html` consulta o Supabase logo depois de resolver o nome, não é
  esperado problema aqui, mas o teste 4 confirma.

**Plano B, só se o teste 4 falhar.** Entradas por IP em `/ip hotspot walled-garden ip`. Os nomes
precisam ser completos, sem curinga, e o IP é resolvido na hora de criar a entrada, então pode
ficar velho. Prefira corrigir o DNS do aparelho antes de recorrer a isso.

Não libere endereços de detecção de captive portal (como os que o iPhone e o Android consultam ao
conectar): o portal deixa de abrir sozinho.

## 7. Erros traduzidos

```
/ip hotspot profile set hsprof-facaamigos html-directory=flash/hotspot
```

O RouterOS já lê `errors.txt` automaticamente do `html-directory` — não precisa de
comando adicional.

## 8. Retenção de log (recomendado para uma clínica)

```
/system logging action add name=log-remoto target=remote remote=<IP do seu servidor de log/SIEM>
/system logging add topics=hotspot action=log-remoto
```

Confirme o prazo de retenção adequado com quem cuida do jurídico/LGPD da clínica — isso
aqui é a configuração técnica, não uma orientação legal.

## 9. Teste ponta a ponta

1. Conectar um iPhone e um Android à rede de visitantes.
2. Confirmar que o CNA (Captive Network Assistant) abre sozinho.
3. Preencher o cadastro → confirmar que `alogin.html` aparece com a oferta.
4. **Conferir que o lead chegou.** Com o aparelho que acabou de se cadastrar, abra a aba "Cupons
   Wi-Fi" do `/admin` e procure a linha dele. O portal libera a internet mesmo se o envio do lead
   falhar (é de propósito), então Wi-Fi funcionando **não prova** que o cadastro foi gravado. Sem
   linha, o walled garden da seção 6 está errado. Depois feche a janela do CNA (comportamento
   normal do iOS/Android) e confirme que a linha do cadastro continua lá (o portal não envia mais e-mail
   nem cupom) — **este é o teste mais importante do projeto**.
5. Desconectar e reconectar o mesmo aparelho → anotar se o formulário volta ou não, e qual tela
   aparece. Se o formulário voltar, aplique o plano B da seção 5.
6. Com um aparelho **não logado**, tentar abrir um site fora da lista → deve cair no portal, não
   navegar livre. Abrir `https://institutofacaamigos.com.br/politica-privacidade` deve funcionar.
7. **Isolamento.** Com um aparelho logado, tentar acessar um computador da clínica e o IP do
   roteador na LAN (`ping 192.168.88.1`). Nada deve responder.
8. **Banda.** Rodar um teste de velocidade num celular logado e comparar com os limites da
   seção 4.1. Conferir a fila dinâmica em `/queue simple print stats`.

## Fases 2 e 3 — já implementadas no repositório

- **Backend:** `supabase/migrations/20260919120000_fa_wifi_leads.sql` (tabela
  `fa_wifi_leads`) + `supabase/functions/wifi-lead-webhook/` (grava o lead; desde 03/11/2026 não gera
  cupom nem envia e-mail: o `ESPERA-XXXX` nasce no Mural, via `wifi-mural-coupon`) + `supabase/functions/wifi-coupon-admin/`
  (consulta/resgate do cupom pelo balcão). Migration aplicada e as duas functions
  implantadas em 19/09/2026 (projeto `ivjvpdzsfjdpyabbzzuj`).
- **Site:** `wifi.html` na raiz do repo, rota `/wifi` (via `cleanUrls` do Vercel),
  `noindex` em `robots.txt` e `vercel.json` — é para onde os botões "Ver todos os
  benefícios" do `alogin.html`/`status.html` apontam.
- **Variáveis de ambiente a configurar no projeto Supabase** (Dashboard → Edge
  Functions → Secrets), além das que `behavior-test-webhook` já usa
  (`BREVO_API_KEY`, `BREVO_FROM`, `BREVO_REPLY_TO`):
  - `WIFI_ADMIN_API_KEY` — segredo fixo usado pelo balcão para consultar/resgatar
    cupons via `wifi-coupon-admin` (`Authorization: Bearer <valor>`).

## Resgate do cupom e resumo

- **O cupom só nasce no Mural da Família** (função `wifi-mural-coupon`), para o responsável cadastrado na Clínica: 1
  por responsável a cada 30 dias, vale 15 dias. O cadastro do Wi-Fi não emite cupom nem envia e-mail. Quem se
  cadastra de novo com o mesmo WhatsApp (com ou sem o 9), o mesmo e-mail ou o mesmo aparelho antes de 30 dias só soma
  uma visita ao cadastro existente. A aba Cupons Wi-Fi lista só linhas com cupom; o resumo do dono conta todos os
  cadastros, mas as métricas de cupom consideram só as linhas com cupom.

- **Aba "Cupons Wi-Fi" do `/admin`** (entrada pelo Hub de Gestão; a equipe usa o login direto limitado): lista os
  cadastros, mostra o código, o nome e o status, e resgata no Playground ou no Circuito (um benefício por cupom, cupom
  vencido não resgata). O dono também vê o resumo do portal, o telefone, o e-mail e quem aceitou contato.
- **Caixa:** o cupom `ESPERA-XXXX` também existe, com o mesmo código, no caixa do Circuito (+5 min) e dos dois
  Playgrounds, Parque Shopping e Bosque Grão-Pará (meia inclusiva), de uso único. O atendente pode digitar o código
  direto no caixa em vez de usar a aba. O uso no caixa aparece na aba como "Usado no caixa". Usar em uma unidade
  desativa o mesmo código nas outras duas.
- `wifi-coupon-admin` (API com `WIFI_ADMIN_API_KEY`) continua existindo como alternativa por linha de comando, mas a
  aba é o caminho normal:

```bash
# Consultar
curl -H "Authorization: Bearer $WIFI_ADMIN_API_KEY" \
  "https://ivjvpdzsfjdpyabbzzuj.supabase.co/functions/v1/wifi-coupon-admin?code=ESPERA-AB12"
```

## Operação assistida (quem não mexe em MikroTik)

Ordem, sempre: **diagnóstico → backup → correção → teste**. Os scripts estão em `hotspot/rsc/`.

1. `00-diagnostico.rsc`: só lê. Mostra rede, hotspot, usuário `visitante`, walled garden, DNS, firewall e o log do hotspot.
2. `10-backup.rsc`: salva `.backup` e `.rsc` em Files. Para voltar atrás: `/system backup load name=<arquivo>`.
3. `20-corrigir.rsc`: cria/ajusta só o usuário `visitante` e o walled garden do Supabase e do site. Não mexe em bridge, DHCP, firewall, NAT, portas nem senha de admin.
4. Copiar `hotspot/*.html`, `md5.js`, `errors.txt` e `logo.png` para `flash/hotspot/` (Files do WinBox, arrastar e soltar).
5. Teste com celular: conectar em **FaçaAmigos- Clientes**, cadastrar, conferir a tela de liberado, a linha em `fa_wifi_leads` e o log (`/log print where topics~"hotspot"`).

**Por que o login travava:** o hash CHAP era calculado com UTF-8 e com o desafio lido de um campo HTML. Corrigido em `login.html` e `md5.js` (PR #101). Se mesmo assim falhar, o log do hotspot mostra o motivo (usuário inexistente, senha errada, `login-by`).

**Mudanças de rede** (bridge, endereços, firewall) só com o **Safe Mode** do WinBox ligado e backup feito, em horário sem movimento na clínica.

## Outras pendências

- **Horário Inclusivo:** confirmado como 10h–16h, todos os dias — `playground.html`,
  `wifi.html` e o portal já estão alinhados (o nome "Manhã Inclusiva" foi trocado).
