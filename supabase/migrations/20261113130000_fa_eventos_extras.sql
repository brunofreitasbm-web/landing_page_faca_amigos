-- Eventos, extras (13/11/2026): imagens do evento no Storage e comunicado aos inscritos.
-- Idempotente: pode ser aplicada mais de uma vez.

-- ---------------------------------------------------------------------------------------------
-- 1) Bucket publico das imagens (capa e foto do palestrante). Sem policy: so a service role grava
--    (eventos-admin, acao imagem_upload); a leitura publica vem de o bucket ser publico.
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('eventos-imagens', 'eventos-imagens', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- ---------------------------------------------------------------------------------------------
-- 2) Comunicados: mensagem do organizador a quem esta inscrito num evento (mudou a sala, o horario...).
-- ---------------------------------------------------------------------------------------------
create table if not exists public.fa_eventos_comunicados (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.fa_eventos (id) on delete cascade,
  assunto text not null check (char_length(assunto) between 3 and 150),
  mensagem text not null check (char_length(mensagem) between 10 and 5000),
  destinatarios text not null check (destinatarios in ('confirmadas', 'ativos')),
  total integer not null default 0,
  criado_por text,
  created_at timestamptz not null default now()
);

comment on table public.fa_eventos_comunicados is
  'Comunicados enviados aos inscritos de um evento. Cada destinatario vira uma linha em fa_eventos_envios (tipo comunicado, comunicado_id).';

create index if not exists fa_eventos_comunicados_evento_idx on public.fa_eventos_comunicados (evento_id, created_at desc);
alter table public.fa_eventos_comunicados enable row level security;

-- Envios: novo tipo e a referencia ao comunicado.
alter table public.fa_eventos_envios
  add column if not exists comunicado_id uuid references public.fa_eventos_comunicados (id) on delete cascade;

alter table public.fa_eventos_envios drop constraint if exists fa_eventos_envios_tipo_check;
alter table public.fa_eventos_envios add constraint fa_eventos_envios_tipo_check check (tipo in (
  'voucher', 'voucher_reenvio', 'lista_espera', 'promocao',
  'lembrete_24h', 'lembrete_hoje', 'pos_evento', 'evento_cancelado', 'comunicado'
));

-- Um envio por (inscricao, tipo) continua valendo para os tipos fixos; comunicado pode repetir, mas uma vez por comunicado.
drop index if exists public.fa_eventos_envios_unq;
create unique index if not exists fa_eventos_envios_unq
  on public.fa_eventos_envios (inscricao_id, tipo) where tipo not in ('voucher_reenvio', 'comunicado');
create unique index if not exists fa_eventos_envios_comunicado_unq
  on public.fa_eventos_envios (inscricao_id, comunicado_id) where tipo = 'comunicado';
