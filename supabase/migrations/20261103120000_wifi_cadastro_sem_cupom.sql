-- Portal Wi-Fi sem cupom, 03/11/2026.
-- O cadastro do Wi-Fi deixa de emitir cupom e de enviar e-mail: o ESPERA-XXXX nasce só no Mural da Família
-- (wifi-mural-coupon). A linha do portal continua sendo gravada (consentimento, opt-ins, UTM, visitas), então
-- os campos do cupom passam a aceitar nulo. A unicidade de coupon_code continua valendo para os cupons reais
-- (o Postgres aceita vários nulos numa coluna unique).
alter table public.fa_wifi_leads
  alter column coupon_code drop not null,
  alter column coupon_status drop not null,
  alter column coupon_expires_at drop not null;
