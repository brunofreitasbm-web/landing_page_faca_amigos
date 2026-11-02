# 00-diagnostico.rsc: SÓ LEITURA. Não altera nada no roteador.
# Rodar:  /import file-name=00-diagnostico.rsc   (ou colar no Terminal do WinBox)
:put "=== VERSAO E RECURSOS ==="
/system resource print
/system identity print
:put "=== ENDERECOS IP (confere 192.168.20.x ou 10.20.0.x) ==="
/ip address print
:put "=== PONTES E PORTAS ==="
/interface bridge print
/interface bridge port print
:put "=== HOTSPOT: servidor, perfil, login-by ==="
/ip hotspot print
/ip hotspot profile print detail
:put "=== USUARIO VISITANTE E PERFIL ==="
/ip hotspot user print detail
/ip hotspot user profile print detail
:put "=== SESSOES ATIVAS ==="
/ip hotspot active print
:put "=== WALLED GARDEN (precisa ter Supabase e institutofacaamigos) ==="
/ip hotspot walled-garden print
/ip hotspot walled-garden ip print
:put "=== DHCP E DNS (visitante deve usar o DNS do roteador) ==="
/ip dhcp-server print
/ip dhcp-server network print
/ip dns print
:put "=== FIREWALL E FASTTRACK ==="
/ip firewall filter print
:put "=== ARQUIVOS DO PORTAL EM flash/hotspot ==="
/file print where name~"hotspot"
:put "=== ULTIMOS LOGS DO HOTSPOT ==="
/log print where topics~"hotspot"
:put "=== FIM DO DIAGNOSTICO ==="
