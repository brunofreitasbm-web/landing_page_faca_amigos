# Landings de campanha (src/content/campanhas/)

Um arquivo `.json` por campanha REAL. O nome do arquivo vira a URL: `ferias-clinica.json` -> `/lp/ferias-clinica`.
A página sai com `noindex` (não entra no Google nem no sitemap), sem o menu do site e com rodapé enxuto (CNPJ, endereço, privacidade).
Arquivos que começam com `_` (este aqui) são ignorados.

Modelo:

```json
{
  "titulo": "Seu filho brinca com mediação, você descansa",
  "subtitulo": "Playground inclusivo no Parque Shopping, com mediadores por perto.",
  "descricao": "Playground inclusivo em Belém: mediadores especializados e pulseira de identificação. Até 160 caracteres.",
  "unidade": "parque",
  "imagem": { "src": "img/exemplo.webp", "alt": "Crianças no playground do Parque Shopping" },
  "beneficios": [
    { "titulo": "Mediadores por perto", "texto": "Equipe treinada acompanha as crianças no espaço." },
    { "titulo": "Pulseira de identificação", "texto": "Cadastro na entrada, para você saber onde ele está." },
    { "titulo": "Espaço para todas as crianças", "texto": "Com ou sem laudo, no mesmo salão." }
  ],
  "faq": [{ "q": "Precisa de agendamento?", "a": "Não. É só chegar." }],
  "cta": { "rotulo": "Tirar dúvida no WhatsApp", "tipo": "whatsapp", "mensagem": "Oi! Vim pela campanha e quero saber mais." },
  "encerraEm": "2026-12-31"
}
```

- `unidade`: de quem é o WhatsApp do botão e o endereço do rodapé (`parque`, `graopara` ou `clinica`). O Circuito não tem telefone próprio: use `parque`.
- `cta.tipo`: `whatsapp` (padrão) ou `link` (com `href`, ex.: `/mapeamento` ou o checkout do e-book).
- `encerraEm` (opcional): depois dessa data a página deixa de ser gerada no próximo deploy.
- O build recusa texto com termos proibidos pela marca: festa, aniversário, promessa, confiança, oferta (não existe serviço de festa; o aniversário é só cortesia no CRM).
- Sem promessa de resultado clínico, sem depoimento de paciente, nunca expor a criança.
- Para medir, use as UTMs do anúncio na URL (`/lp/<arquivo>?utm_source=...`). CORREÇÃO (nov/2026): o `fa-track.js` guarda a origem num cookie e dispara `whatsapp_click` no GA4 (a sessão leva a UTM), e `window.faOrigin()` alimenta formulários e o checkout da Hotmart. Ele NÃO coloca a UTM na conversa do WhatsApp: o clique abre `wa.me` com a mensagem fixa. Para a origem chegar ao atendimento, use `cta.origemNaMensagem` (abaixo).
- Arquivo `_nome.json` com `_` na frente = campanha dormente (ignorada). Para ativar, renomeie para `nome.json`. Para pré-visualizar sem ativar: `node scripts/preview-campanha.mjs <nome>`.

Campos opcionais (todos retrocompatíveis; sem eles a página sai como antes). Detalhes em `docs/ritmo-landing-LEIA-ME.md`:

- `nome`: o texto `{nome}` em qualquer campo vira esse valor antes da validação (um único ponto para trocar o nome do plano).
- `rotulo` (linha acima do h1), `destaques` (até 4 chips sob o subtítulo), `cta.microtexto` (linha sob o botão do topo).
- `comparacao` (`titulo`, `intro`, `antes` e `depois` com `rotulo` + `itens`, `nota`), `passos` (`titulo`, `itens[{titulo, texto}]`), `faqTitulo`, `fim` (`titulo`, `texto`, `imagem`).
- `cta.origemNaMensagem: true`: acrescenta `(ref: <utm_source>-<utm_medium>-<utm_campaign>)` à mensagem do WhatsApp quando a URL traz UTM.
- `regrasSaude: true`: o build também recusa preço, desconto, promoção, "pacote", "garantia", forma de pagamento específica, "cura", superlativos, depoimento, escassez e travessão. Use em campanhas de serviço de saúde.
