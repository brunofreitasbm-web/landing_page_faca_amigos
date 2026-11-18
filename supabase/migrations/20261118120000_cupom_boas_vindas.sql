-- Cupom de boas-vindas do Portal da Família (BEMVINDO-XXXX), 18/11/2026.
-- Emitido no 1º acesso ao Portal pela Edge Function wifi-mural-coupon (kind = 'boas_vindas').
-- Regras: 1 por responsável (para sempre), vale 15 dias, uso único entre unidades, SÓ de segunda a quinta
-- (fuso de Belém), Playground OU Circuito. O benefício (tempo extra) vem de fa_kiosk_coupons.kind/value.
-- Os cupons ESPERA-% não mudam de regra: tudo aqui é condicionado ao prefixo BEMVINDO-.

-- 1) Origem do cadastro e unicidade.
alter table public.fa_wifi_leads drop constraint if exists fa_wifi_leads_source_check;
alter table public.fa_wifi_leads
  add constraint fa_wifi_leads_source_check check (source in ('portal', 'mural', 'boas_vindas'));

create unique index if not exists fa_wifi_leads_boas_vindas_uniq
  on public.fa_wifi_leads (mural_guardian_id)
  where source = 'boas_vindas';

-- 2) Uso único entre unidades (mesma regra do ESPERA-, agora também para BEMVINDO-).
create or replace function public.fa_kiosk_coupons_espera_um_uso()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.code, 0));

  if exists (
    select 1 from public.fa_kiosk_coupons o
     where o.code = new.code and o.id <> new.id and o.used_count > 0
  ) then
    raise exception 'CUPOM_ESGOTADO' using detail = 'Este cupom já foi usado na outra unidade (um benefício por cupom)';
  end if;

  update public.fa_kiosk_coupons
     set active = false
   where code = new.code and id <> new.id and active;

  return new;
end;
$$;

revoke all on function public.fa_kiosk_coupons_espera_um_uso() from public;

drop trigger if exists fa_kiosk_coupons_espera_um_uso on public.fa_kiosk_coupons;
create trigger fa_kiosk_coupons_espera_um_uso
  before update on public.fa_kiosk_coupons
  for each row
  when (new.used_count > old.used_count and (new.code like 'ESPERA-%' or new.code like 'BEMVINDO-%'))
  execute function public.fa_kiosk_coupons_espera_um_uso();

-- 3) Só de segunda a quinta (dia de Belém). Mesmo prefixo de erro que o caixa já trata.
create or replace function public.fa_kiosk_coupons_dia_semana()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if extract(isodow from (now() at time zone 'America/Belem')) > 4 then
    raise exception 'CUPOM_INVALIDO: Cupom de boas-vindas vale de segunda a quinta';
  end if;
  return new;
end;
$$;

revoke all on function public.fa_kiosk_coupons_dia_semana() from public;

drop trigger if exists fa_kiosk_coupons_dia_semana on public.fa_kiosk_coupons;
create trigger fa_kiosk_coupons_dia_semana
  before update on public.fa_kiosk_coupons
  for each row
  when (new.used_count > old.used_count and new.code like 'BEMVINDO-%')
  execute function public.fa_kiosk_coupons_dia_semana();

comment on trigger fa_kiosk_coupons_dia_semana on public.fa_kiosk_coupons is
  'BEMVINDO-XXXX só pode ser usado de segunda a quinta (fuso America/Belem).';

-- 4) Validade (trigger fa_kiosk_coupons_validade) já vale para qualquer cupom com expires_at_ms: nada a mudar.

-- 5) Leitura direta escondida também para BEMVINDO-%; a operadora usa fa_kiosk_wifi_coupon_lookup.
drop policy if exists fa_kiosk_read_authenticated on public.fa_kiosk_coupons;
create policy fa_kiosk_read_authenticated on public.fa_kiosk_coupons
  for select to authenticated
  using (code not like 'ESPERA-%' and code not like 'BEMVINDO-%');

-- 6) Limpeza diária dos vencidos (inclui BEMVINDO-%).
select cron.schedule(
  'fa-wifi-cupons-vencidos',
  '20 7 * * *',
  $$
    update public.fa_kiosk_coupons c
       set active = false
      from public.fa_wifi_leads l
     where c.code = l.coupon_code
       and (c.code like 'ESPERA-%' or c.code like 'BEMVINDO-%')
       and c.active
       and l.coupon_expires_at < now();
  $$
);

-- 7) Conferência da operadora: aceita BEMVINDO- e diz FORA_DO_DIA de sexta a domingo.
create or replace function public.fa_kiosk_wifi_coupon_lookup(p_unit_id uuid, p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
  v_coupon record;
  v_lead record;
  v_expires_ms bigint;
  v_status text;
  v_first text;
  v_last text;
  v_name text;
  v_bv boolean := v_code like 'BEMVINDO-%';
begin
  if not exists (
    select 1 from fa_kiosk_employees e where e.auth_user_id = auth.uid() and e.active
  ) then
    raise exception 'SEM_PERMISSAO';
  end if;

  if v_code not like 'ESPERA-%' and not v_bv then
    return jsonb_build_object('found', false, 'status', 'NAO_ENCONTRADO');
  end if;

  select * into v_coupon from fa_kiosk_coupons where unit_id = p_unit_id and code = v_code;
  if not found then
    return jsonb_build_object('found', false, 'status', 'NAO_ENCONTRADO');
  end if;

  select guardian_name, coupon_expires_at, redeemed_count into v_lead
    from fa_wifi_leads where coupon_code = v_code;

  v_expires_ms := coalesce(
    v_coupon.expires_at_ms,
    case when v_lead.coupon_expires_at is not null
         then (extract(epoch from v_lead.coupon_expires_at) * 1000)::bigint end
  );

  v_status := case
    when v_coupon.used_count > 0 then 'USADO'
    when exists (select 1 from fa_kiosk_coupons o where o.code = v_code and o.id <> v_coupon.id and o.used_count > 0)
      then 'USADO_OUTRA_UNIDADE'
    when coalesce(v_lead.redeemed_count, 0) > 0 then 'USADO'
    when v_expires_ms is not null and v_expires_ms < v_now_ms then 'VENCIDO'
    when not v_coupon.active then 'DESATIVADO'
    when v_bv and extract(isodow from (now() at time zone 'America/Belem')) > 4 then 'FORA_DO_DIA'
    else 'OK'
  end;

  v_name := trim(coalesce(v_lead.guardian_name, ''));
  if v_name <> '' then
    v_first := split_part(v_name, ' ', 1);
    v_last := (regexp_split_to_array(v_name, '\s+'))[array_length(regexp_split_to_array(v_name, '\s+'), 1)];
    v_name := case when v_last <> v_first then v_first || ' ' || upper(left(v_last, 1)) || '.' else v_first end;
  end if;

  return jsonb_build_object(
    'found', true,
    'status', v_status,
    'id', v_coupon.id,
    'code', v_coupon.code,
    'kind', v_coupon.kind,
    'value', v_coupon.value,
    'description', v_coupon.description,
    'maxUses', v_coupon.max_uses,
    'usedCount', v_coupon.used_count,
    'active', v_coupon.active,
    'expiresAtMs', v_expires_ms,
    'guardianName', nullif(v_name, ''),
    'validoDias', case when v_bv then 'seg-qui' else null end
  );
end;
$$;

revoke all on function public.fa_kiosk_wifi_coupon_lookup(uuid, text) from public, anon;
grant execute on function public.fa_kiosk_wifi_coupon_lookup(uuid, text) to authenticated, service_role;
