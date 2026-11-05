-- Passo 4 da sequência de e-mails do mapa: e-mail gratuito que apresenta a página /aprender (guias e artigos do site).
-- Sai 9 dias depois do resultado do mapa (3 dias depois do último e-mail de venda, o D+6).
-- Passo 5: e-mail de próximo passo com a clínica (3 caminhos pelo WhatsApp), 12 dias depois do resultado.
-- A chave única (lead_id, step) continua impedindo envio duplicado; só amplia os passos aceitos de 1..3 para 1..5.

alter table public.fa_teste_ebook_seq
  drop constraint if exists fa_teste_ebook_seq_step_check;

alter table public.fa_teste_ebook_seq
  add constraint fa_teste_ebook_seq_step_check check (step in (1, 2, 3, 4, 5));

comment on table public.fa_teste_ebook_seq is
  'Um registro por e-mail da sequência enviado a um lead (passos 1-3: guia/e-book; passo 4: conteúdo gratuito /aprender; passo 5: próximo passo com a clínica). A chave única impede envio duplicado.';
