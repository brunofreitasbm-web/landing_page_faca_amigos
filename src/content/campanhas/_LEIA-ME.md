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
- `cta.tipo`: `whatsapp` (padrão) ou `link` (com `href`, ex.: `/teste` ou o checkout do e-book).
- `encerraEm` (opcional): depois dessa data a página deixa de ser gerada no próximo deploy.
- O build recusa texto com termos proibidos pela marca: festa, aniversário, promessa, confiança, oferta (não existe serviço de festa; o aniversário é só cortesia no CRM).
- Sem promessa de resultado clínico, sem depoimento de paciente, nunca expor a criança.
- Para medir, use as UTMs do anúncio na URL (`/lp/<arquivo>?utm_source=...`): o `fa-track.js` repassa a origem ao WhatsApp e ao checkout.
