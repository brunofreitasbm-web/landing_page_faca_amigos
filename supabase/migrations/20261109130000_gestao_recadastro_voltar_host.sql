-- Gestão Hub, Fase 2b: o RH roda em dois endereços (Grupo IB e Porto Terapia). O código de uso único guarda
-- o host de onde a pessoa veio (só um da lista do Hub) para o botão "Voltar ao sistema". Aditiva e idempotente.
alter table public.fa_gestao_recadastro_tickets
  add column if not exists voltar_host text;
