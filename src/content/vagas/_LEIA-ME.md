# Vagas abertas (src/content/vagas/)

Um arquivo `.json` por vaga REAL e aberta. Arquivos que começam com `_` (este aqui) são ignorados.
Banco de talentos não é vaga: o formulário geral de /trabalhe-conosco continua existindo sem schema.

Modelo (copie para `psicologo-aba-clinica.json`; o nome do arquivo vira a URL /trabalhe-conosco/psicologo-aba-clinica):

```json
{
  "titulo": "Psicólogo(a) aplicador(a) ABA",
  "unidade": "clinica",
  "tipo": ["FULL_TIME"],
  "publicadaEm": "2026-11-03",
  "validaAte": "2026-12-03",
  "descricao": "O que a pessoa vai fazer, com quem, em qual horário, o que a clínica oferece... (mínimo 200 caracteres; parágrafos separados por linha em branco).",
  "atividades": ["Aplicar programas de ensino individualizados", "Registrar dados de cada sessão"],
  "requisitos": ["Graduação em Psicologia", "Experiência em ABA (desejável)"],
  "salario": { "min": 3000, "max": 4000, "por": "MONTH" }
}
```

- `unidade`: `parque`, `graopara` ou `clinica`. `tipo`: `FULL_TIME` ou `PART_TIME` (CLT), `CONTRACTOR` (PJ), `INTERN` (estágio), `TEMPORARY`.
- `validaAte`: último dia em que a vaga está aberta. Depois disso ela some da página e do sitemap no próximo deploy.
  Encerrou antes? Apague o arquivo (ou troque `validaAte`) e faça o deploy.
- `salario` é opcional: só publique com autorização de quem decide.
- Nunca marque como vaga uma função que não está aberta agora.
