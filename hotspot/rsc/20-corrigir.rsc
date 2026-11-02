# 20-corrigir.rsc: ajustes mínimos e idempotentes (pode rodar mais de uma vez).
# NÃO mexe em bridge, DHCP, firewall, NAT, senha admin nem portas. Rode 10-backup.rsc primeiro.

# 1) Usuário compartilhado "visitante" (usa o perfil up-visitantes se existir, senão o padrão).
:local prof "default"
:if ([:len [/ip hotspot user profile find where name="up-visitantes"]] > 0) do={ :set prof "up-visitantes" }
:if ([:len [/ip hotspot user find where name="visitante"]] = 0) do={
  /ip hotspot user add name=visitante password=visitante profile=$prof comment="conta compartilhada do portal"
  :put "Criado o usuario visitante."
} else={
  /ip hotspot user set [find where name="visitante"] password=visitante disabled=no
  :put "Usuario visitante conferido (senha e habilitado)."
}

# 2) Walled garden: libera só o Supabase do projeto e o site (política de privacidade).
:if ([:len [/ip hotspot walled-garden find where dst-host="ivjvpdzsfjdpyabbzzuj.supabase.co"]] = 0) do={
  /ip hotspot walled-garden add dst-host=ivjvpdzsfjdpyabbzzuj.supabase.co action=allow comment="login.html grava o lead"
  :put "Liberado ivjvpdzsfjdpyabbzzuj.supabase.co"
}
:if ([:len [/ip hotspot walled-garden find where dst-host="institutofacaamigos.com.br"]] = 0) do={
  /ip hotspot walled-garden add dst-host=institutofacaamigos.com.br action=allow comment="link da Politica de Privacidade"
  :put "Liberado institutofacaamigos.com.br"
}

# 3) Derruba sessões antigas para o próximo login usar as regras novas.
/ip hotspot active remove [find]
:put "Concluido. Teste com um celular (roteiro em LEIA-ME-HOTSPOT.md, secao Operacao assistida)."
