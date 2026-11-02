# 10-backup.rsc: cria cópias de segurança ANTES de qualquer mudança. Não altera a configuração.
:local d [/system clock get date]
/system backup save name=("antes-faca-amigos-" . $d)
/export file=("antes-faca-amigos-" . $d)
:put "Backup salvo em Files: antes-faca-amigos-*.backup e .rsc. Para voltar atras: /system backup load name=<arquivo>"
