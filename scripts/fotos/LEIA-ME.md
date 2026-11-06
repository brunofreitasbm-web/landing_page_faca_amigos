# Fotos do Drive nas TVs e nas landings

A fotógrafa sobe as fotos na pasta dela no Google Drive, mais ou menos uma vez por semana. **Toda segunda
às 8h17** (Belém) o GitHub Actions roda `scripts/fotos/sync.mjs`, que:

1. lista a pasta e as subpastas (só a lista de arquivos, sem custo de IA);
2. compara com o **catálogo** e separa só as fotos que ainda não estão nele;
3. baixa cada foto nova, converte HEIC do iPhone para WebP e manda uma versão reduzida para a IA, que diz
   se é foto de verdade (ou logo, arte, print), o tema (o que a foto mostra), a nota de qualidade, se tem
   criança reconhecível, se tem algo sensível, e escreve o texto alternativo e a copy da TV;
4. grava a resposta no catálogo e publica no Supabase Storage (bucket `fotos-site`) o que pode ir ao ar;
5. as páginas leem `fotos-site/manifest.json` sozinhas (TVs a cada hora, landings a cada visita). Não
   precisa de deploy nem de commit.

**Fotógrafa subiu fotos e você não quer esperar a segunda?** GitHub → Actions → Fotos do Drive →
**Run workflow**. Vale também para tirar uma foto do ar na hora.

### Catálogo

O catálogo (`estado.json`, no bucket privado `fotos-estado`) guarda, para cada foto já lida, a resposta da
IA, pela "impressão digital" do arquivo (md5). Por isso:

- cada foto é lida pela IA **uma vez só**, para sempre. A rodada de uma semana sem fotos novas não chama a IA;
- mover uma foto entre pastas (para `Aprovadas`, por exemplo) não gera nova leitura;
- a mesma foto duplicada em duas pastas conta como uma;
- numa sessão grande, o catálogo é salvo a cada 10 fotos: se a rodada cair no meio, a seguinte continua
  de onde parou, sem pagar a IA de novo.

### Rodízio

O catálogo só cresce, então as telas fazem rodízio para as fotos antigas voltarem a aparecer:

- **fotos da última semana** sempre entram;
- o resto do catálogo é sorteado **uma vez por dia**: o mesmo dia mostra a mesma seleção em qualquer tela,
  e no dia seguinte entram outras. As TVs recarregam de madrugada e pegam o sorteio novo;
- tv2: até 20 fotos por dia, além dos slides fixos. Landings: até 6 (Circuito e hub) e 4 (Playground);
- tv e tv3: cada volta de slides começa por outra foto de cada tema.

## Onde cada foto aparece

A IA dá um **tema** a cada foto, pelo que ela mostra (não pelo lugar onde foi tirada). O tema decide o lugar:

| Tema | Exemplos |
|---|---|
| `crianca_dirigindo`, `pelucia_motorizada`, `frota_carrinhos` | criança ao volante, montada na capivara, carrinhos alinhados |
| `quiosque_circuito` | balcão, fila, corredor, sem carrinho em destaque |
| `piscina_bolinhas`, `acolhimento`, `oficina_arte`, `cantinho_calma`, `brincadeira`, `fachada_playground` | Playground |
| `clinica_terapia`, `clinica_materiais`, `clinica_sensorial`, `clinica_fachada` | Clínica |
| `equipe` | equipe posando ou em bastidor |
| `outro` | nada acima: não vai para TV nenhuma |

- **tv2.html (quiosque)** é exclusiva do Circuito: só cria slide novo com `crianca_dirigindo`,
  `pelucia_motorizada` ou `frota_carrinhos`, com a copy escrita pela IA. Foto do balcão ou do Playground nunca entra.
- **tv.html (salão)** e **tv3.html (clínica)**: cada slide tem o tema da foto fixa que já usa (slide da
  piscina, slide do cantinho, slide do painel sensorial…) e só troca por foto nova **do mesmo tema**. Sem
  foto nova do tema, fica a fixa. A mesma foto nova não aparece em dois slides na mesma volta. O mapa
  foto fixa → tema fica em `/assets/fa-fotos.js` (`TEMA_POR_IMAGEM`).
- Retrato da Isabella e foto do Grão-Pará nunca são trocados.

| Situação | TV | Site |
|---|---|---|
| Foto boa, com tema | nos slides do mesmo tema (acima) | só se aprovada |
| Foto da Clínica **com** criança reconhecível | só se aprovada (criança em terapia é dado de saúde) | só se aprovada |
| Logo, arte do Canva, print, foto desfocada (nota abaixo de 3/5) | não | não (desfocada aprovada à mão vai) |
| Tema `outro` | não | só se aprovada |
| Algo sensível (choro, troca de roupa, documento, placa de carro…) | não | não, nem aprovada |
| Arquivo de alguém fora de `FOTOS_DONOS` | não | não |

**Aprovar para o site:** crie uma subpasta chamada `Aprovadas` dentro da pasta da fotógrafa e arraste (ou
copie) a foto para lá. Na próxima rodada (segunda, ou na hora pelo Run workflow) ela entra em:

- `/circuito`, no começo da galeria "Vem ver de perto" (fotos do Circuito, até 6);
- `/playground`, na galeria "Vem ver o nosso espaço", depois da foto da fachada (Playground e equipe, até 4);
- `/` (hub), na seção "Momentos recentes", que só aparece quando houver 3 ou mais aprovadas (até 6, todas as unidades).

**Tirar do ar:** apague a foto do Drive, ou mova para uma subpasta `Recusadas` (também vale `Não usar`,
`Ignorar`, `Privado`). Na próxima rodada ela sai das TVs e do site, e os arquivos são apagados do
Storage de verdade. Para tirar só do site, tire de `Aprovadas`.


## Configuração (uma vez)

São 5 segredos no GitHub: **Settings → Secrets and variables → Actions → New repository secret**.

### 1. `GOOGLE_SERVICE_ACCOUNT_JSON`: acesso de leitura ao Drive

1. Entre em https://console.cloud.google.com com a sua conta Google e crie um projeto (ex.: `facaamigos-fotos`).
2. Menu **APIs e serviços → Biblioteca**, procure **Google Drive API** e clique em **Ativar**.
3. Menu **IAM e administrador → Contas de serviço → Criar conta de serviço**. Nome: `fotos-site`. Não
   precisa dar nenhum papel; clique em Concluir.
4. Abra a conta criada, aba **Chaves → Adicionar chave → Criar nova chave → JSON**. Baixa um arquivo `.json`.
5. Copie o e-mail da conta de serviço (algo como `fotos-site@facaamigos-fotos.iam.gserviceaccount.com`).
6. No Drive, na pasta da fotógrafa, clique em **Compartilhar** e adicione esse e-mail como **Leitor**.
   Você é editor da pasta, então consegue fazer isso sem pedir a ela.
7. No GitHub, crie o segredo `GOOGLE_SERVICE_ACCOUNT_JSON` e cole **o conteúdo inteiro** do arquivo `.json`.
   Depois apague o arquivo do seu computador.

### 2. `FOTOS_DRIVE_FOLDER_ID`: qual pasta vigiar

É o código no fim do link da pasta: `https://drive.google.com/drive/folders/ESTE_CODIGO`. Fica em segredo,
e não no código, porque o repositório é público e a pasta está aberta para edição por link: quem tiver o
código consegue entrar.

### 3. `FOTOS_DONOS`: quem pode publicar

E-mails das contas donas dos arquivos que podem ir ao ar, separados por vírgula (a conta da fotógrafa, a
sua e a da Isabella). Arquivo subido por qualquer outra conta é ignorado, inclusive dentro de `Aprovadas`.
Fica como segredo para os e-mails não aparecerem nos logs públicos do Actions.

### 4. `SUPABASE_SERVICE_ROLE_KEY`

Supabase → projeto `ivjvpdzsfjdpyabbzzuj` → **Project Settings → API Keys → service_role** (secret).
Os buckets `fotos-site` (público) e `fotos-estado` (privado) são criados na primeira rodada.

### 5. `ANTHROPIC_API_KEY`

https://console.anthropic.com → **API Keys → Create Key**. Custo estimado: cerca de US$ 0,03 por foto nova
(cada foto é classificada uma vez só; mover entre pastas não gera nova chamada).

### Primeira rodada

GitHub → **Actions → Fotos do Drive (TVs e landings) → Run workflow**. O resumo da rodada mostra cada
foto nova, a unidade e o destino (ou o motivo de ter ficado de fora). Depois disso roda sozinho.

Opcional: a variável (não segredo) `FOTOS_MAX_POR_RODADA` limita quantas fotos novas a IA vê por rodada
(padrão 200, uns 50 minutos de rodada). O que passar disso fica para a rodada seguinte.

## Quando algo dá errado

- **"sumiram da listagem de uma vez"**: mais da metade das fotos não apareceu. Quase sempre é a conta de
  serviço que perdeu o acesso à pasta. Nada foi apagado. Se a remoção foi de propósito, rode o workflow à
  mão marcando "permitir remoção em massa".
- **Foto boa ficou de fora**: o resumo da rodada diz o motivo. Aprovar (mover para `Aprovadas`) passa por
  cima da nota de qualidade.
- **Desligar as fotos novas numa TV**: abra a TV com `?fotos=0` no fim do endereço (ex.: `/tv2?fotos=0`).
- **Reprocessar em HD (TV 4K)**: fotos já publicadas continuam em 1600 px. Rode o workflow com "reprocessar_hd" marcado
  (ou `FOTOS_REPROCESSAR_HD=1`). Cada foto é baixada de novo e gravada com nome novo (`...-hd`, por causa do cache imutável);
  o arquivo antigo só é apagado depois. Se uma falhar, a antiga fica no ar e o erro aparece no resumo. Marca `hd` no catálogo:
  as próximas rodadas não repetem.
- **Testes**: `cd scripts/fotos && npm ci && npm test` (rodam no CI em todo PR).

## Arquivos

| Arquivo | O que faz |
|---|---|
| `sync.mjs` | orquestra a rodada |
| `regras.mjs` | quem vai para onde, limpeza da copy, trava contra remoção em massa |
| `drive.mjs` | listagem e download no Drive (somente leitura) |
| `classificar.mjs` | prompt e esquema da IA |
| `imagem.mjs` | HEIC → JPEG e as versões publicadas (3000 px webp/jpg e 720 px webp, sem EXIF/GPS) |
| `storage.mjs` | Supabase Storage |
| `/assets/fa-fotos.js` | lado das páginas: lê o manifesto e entrega as fotos para cada TV e landing |
