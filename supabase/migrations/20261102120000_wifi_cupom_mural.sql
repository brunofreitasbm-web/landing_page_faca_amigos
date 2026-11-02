-- Cupom ESPERA emitido pelo Mural da Família (app da Clínica), 02/11/2026.
-- O cupom deixa de sair por e-mail no cadastro do Wi-Fi: o responsável cadastrado na Clínica o vê no Mural.
-- A função wifi-mural-coupon grava a linha em fa_wifi_leads (mesmo painel, mesmo resgate no caixa) ligada ao
-- responsável do Mural. O prazo de 30 dias passa a ser por responsável, não por telefone, e-mail ou aparelho.
alter table public.fa_wifi_leads
  add column if not exists mural_guardian_id uuid,
  add column if not exists source text not null default 'portal' check (source in ('portal', 'mural'));

create index if not exists fa_wifi_leads_mural_guardian_idx
  on public.fa_wifi_leads (mural_guardian_id, created_at desc)
  where mural_guardian_id is not null;
