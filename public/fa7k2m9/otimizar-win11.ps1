<#
.SYNOPSIS
    Otimizacao e limpeza de Windows 11 recem-instalado - Clinica Faca Amigos.

.DESCRIPTION
    - Remove bloatware (apps UWP pre-instalados e provisionados)
    - Remove OneDrive (com trava de seguranca se Desktop/Documentos estiverem nele)
    - Neutraliza o Edge (politicas, sem inicializacao automatica, sem sidebar/Copilot)
    - Desativa telemetria, sugestoes, widgets, Copilot, Recall, Bing no menu Iniciar
    - Enxuga inicializacao (Run keys, servicos, tarefas agendadas)
    - Ajusta energia/desempenho e limpa temporarios
    - Aplica ajustes por usuario no usuario atual E no perfil padrao (novos usuarios)

.PARAMETER NoReboot
    Nao pergunta sobre reiniciar no final.

.PARAMETER ForceOneDrive
    Remove o OneDrive mesmo que Desktop/Documentos estejam redirecionados para ele
    (arquivos locais podem ficar inacessiveis - use com cuidado).

.NOTES
    Executar: clique direito > "Executar com o PowerShell" (o script se eleva sozinho)
    ou: powershell -ExecutionPolicy Bypass -File .\otimizar-win11.ps1
    Log: C:\ProgramData\FacaAmigos\otimizar-AAAAMMDD-HHMMSS.log
#>

[CmdletBinding()]
param(
    [switch]$NoReboot,
    [switch]$ForceOneDrive
)

# ============================== CONFIGURACAO ==============================
$ScriptVersao         = '2026.11.04-3'   # AAAA.MM.DD-numero (some 1 a cada publicacao)
$RemoverOneDrive      = $true
$RemoverBloatware     = $true
$NeutralizarEdge      = $true    # Edge NAO e desinstalado (ver observacao no final)
$DesativarTelemetria  = $true
$AjustarServicos      = $true
$AjustarEnergia       = $true
$LimparTemporarios    = $true
$CriarPontoRestauracao = $true

# Apps a remover (wildcards). Mantidos de proposito: Calculadora, Fotos, Loja,
# Bloco de Notas, Paint, Terminal, Ferramenta de Captura, Assistencia Rapida.
$AppsParaRemover = @(
    'Microsoft.BingNews','Microsoft.BingWeather','Microsoft.BingSearch',
    'Microsoft.GetHelp','Microsoft.Getstarted','Microsoft.MicrosoftOfficeHub',
    'Microsoft.Microsoft3DViewer','Microsoft.MixedReality.Portal',
    'Microsoft.MicrosoftSolitaireCollection','Microsoft.People',
    'Microsoft.PowerAutomateDesktop','Microsoft.SkypeApp','Microsoft.Todos',
    'Microsoft.WindowsFeedbackHub','Microsoft.WindowsMaps','Microsoft.YourPhone',
    'Microsoft.ZuneMusic','Microsoft.ZuneVideo','Microsoft.Wallet','Microsoft.OneConnect',
    'Microsoft.549981C3F5F10','Microsoft.Copilot','Microsoft.OutlookForWindows',
    'Microsoft.DevHome','Microsoft.MicrosoftStickyNotes','Microsoft.WindowsCommunicationsApps',
    'Clipchamp.Clipchamp','MSTeams','MicrosoftTeams',
    'Microsoft.XboxApp','Microsoft.GamingApp','Microsoft.XboxGamingOverlay',
    'Microsoft.XboxGameOverlay','Microsoft.XboxIdentityProvider','Microsoft.XboxSpeechToTextOverlay',
    'Microsoft.Xbox.TCUI','MicrosoftCorporationII.MicrosoftFamily',
    '*Disney*','*Spotify*','*TikTok*','*Facebook*','*Instagram*','*LinkedIn*',
    '*Netflix*','*AmazonPrimeVideo*','*CandyCrush*','*McAfee*','*Dropbox*','*Twitter*','*WhatsApp*'
)

# Valores em Run (inicializacao) a remover - curingas
$RunParaRemover = @('OneDrive*','MicrosoftEdgeAutoLaunch*','Teams*','com.squirrel.Teams*','Skype*','Spotify*')

# Servicos a desativar
$ServicosDesativar = @(
    'DiagTrack','dmwappushservice','MapsBroker','RetailDemo','Fax','RemoteRegistry',
    'XblAuthManager','XblGameSave','XboxNetApiSvc','XboxGipSvc','WMPNetworkSvc'
)

# Tarefas agendadas a desativar (caminho, nome)
$TarefasDesativar = @(
    @('\Microsoft\Windows\Application Experience\','Microsoft Compatibility Appraiser'),
    @('\Microsoft\Windows\Application Experience\','ProgramDataUpdater'),
    @('\Microsoft\Windows\Application Experience\','StartupAppTask'),
    @('\Microsoft\Windows\Customer Experience Improvement Program\','Consolidator'),
    @('\Microsoft\Windows\Customer Experience Improvement Program\','UsbCeip'),
    @('\Microsoft\Windows\Feedback\Siuf\','DmClient'),
    @('\Microsoft\Windows\Feedback\Siuf\','DmClientOnScenarioDownload'),
    @('\Microsoft\Windows\Windows Error Reporting\','QueueReporting'),
    @('\Microsoft\Windows\DiskDiagnostic\','Microsoft-Windows-DiskDiagnosticDataCollector')
)
# ===========================================================================

$ErrorActionPreference = 'Continue'

# --- Auto-elevacao ---
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    if (-not $PSCommandPath) {
        Write-Host 'Salve o script como .ps1 e execute a partir do arquivo.' -ForegroundColor Red
        exit 1
    }
    $args2 = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    if ($NoReboot)      { $args2 += ' -NoReboot' }
    if ($ForceOneDrive) { $args2 += ' -ForceOneDrive' }
    Start-Process powershell.exe -Verb RunAs -ArgumentList $args2
    exit
}

# --- Log ---
$LogDir = 'C:\ProgramData\FacaAmigos'
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
$LogFile = Join-Path $LogDir ("otimizar-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
Start-Transcript -Path $LogFile -Force | Out-Null
Write-Host "`n#### Otimizador Windows 11 - Faca Amigos - VERSAO $ScriptVersao ####" -ForegroundColor Magenta
Write-Host "Computador: $env:COMPUTERNAME | Usuario: $env:USERNAME | Data: $(Get-Date -Format 'dd/MM/yyyy HH:mm')" -ForegroundColor Gray

function Write-Step([string]$msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Ok([string]$msg)   { Write-Host "  [ok] $msg" -ForegroundColor Green }
function Write-Warn2([string]$msg){ Write-Host "  [!]  $msg" -ForegroundColor Yellow }

function Set-Reg {
    param([string]$Path,[string]$Name,$Value,[string]$Type = 'DWord')
    try {
        if (-not (Test-Path -LiteralPath $Path)) { New-Item -Path $Path -Force | Out-Null }
        New-ItemProperty -LiteralPath $Path -Name $Name -Value $Value -PropertyType $Type -Force | Out-Null
    } catch {
        Write-Warn2 "Falha ao gravar $Path\$Name : $($_.Exception.Message)"
    }
}

# ------------------------------------------------------------------
# Ajustes POR USUARIO (aplicados em HKCU e no perfil padrao)
# ------------------------------------------------------------------
function Set-UserTweaks {
    param([string]$Root)   # 'HKCU:' ou 'Registry::HKEY_USERS\FA_DEFAULT'
    $adv = "$Root\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced"
    Set-Reg $adv 'HideFileExt' 0
    Set-Reg $adv 'LaunchTo' 1                     # Explorer abre em "Este Computador"
    Set-Reg $adv 'TaskbarDa' 0                    # Widgets
    Set-Reg $adv 'TaskbarMn' 0                    # Chat/Teams
    Set-Reg $adv 'ShowTaskViewButton' 0
    Set-Reg $adv 'ShowCopilotButton' 0
    Set-Reg $adv 'Start_IrisRecommendations' 0    # recomendacoes no Iniciar
    Set-Reg $adv 'Start_AccountNotifications' 0
    Set-Reg "$Root\Software\Microsoft\Windows\CurrentVersion\Search" 'SearchboxTaskbarMode' 1   # so icone
    Set-Reg "$Root\Software\Microsoft\Windows\CurrentVersion\Search" 'BingSearchEnabled' 0

    $cdm = "$Root\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager"
    foreach ($n in 'ContentDeliveryAllowed','OemPreInstalledAppsEnabled','PreInstalledAppsEnabled',
                   'PreInstalledAppsEverEnabled','SilentInstalledAppsEnabled','SoftLandingEnabled',
                   'SystemPaneSuggestionsEnabled','RotatingLockScreenOverlayEnabled',
                   'SubscribedContent-310093Value','SubscribedContent-338387Value',
                   'SubscribedContent-338388Value','SubscribedContent-338389Value',
                   'SubscribedContent-338393Value','SubscribedContent-353694Value',
                   'SubscribedContent-353696Value','SubscribedContent-353698Value') {
        Set-Reg $cdm $n 0
    }
    Set-Reg "$Root\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo" 'Enabled' 0
    Set-Reg "$Root\Software\Microsoft\Windows\CurrentVersion\Privacy" 'TailoredExperiencesWithDiagnosticDataEnabled' 0
    Set-Reg "$Root\Software\Microsoft\Windows\CurrentVersion\GameDVR" 'AppCaptureEnabled' 0
    Set-Reg "$Root\System\GameConfigStorage" 'GameDVR_Enabled' 0
    Set-Reg "$Root\Software\Policies\Microsoft\Windows\Explorer" 'DisableSearchBoxSuggestions' 1
}

$Resumo = New-Object System.Collections.Generic.List[string]

# ------------------------------------------------------------------
# 0. Ponto de restauracao
# ------------------------------------------------------------------
if ($CriarPontoRestauracao) {
    Write-Step 'Ponto de restauracao'
    try {
        Set-Reg 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore' 'SystemRestorePointCreationFrequency' 0
        Enable-ComputerRestore -Drive "$env:SystemDrive\" -ErrorAction Stop
        Checkpoint-Computer -Description 'Antes da otimizacao Faca Amigos' -RestorePointType MODIFY_SETTINGS -ErrorAction Stop
        Write-Ok 'Ponto de restauracao criado'
        $Resumo.Add('Ponto de restauracao criado')
    } catch {
        Write-Warn2 "Nao foi possivel criar ponto de restauracao: $($_.Exception.Message)"
    }
}

# ------------------------------------------------------------------
# 1. Bloatware
# ------------------------------------------------------------------
if ($RemoverBloatware) {
    Write-Step 'Removendo bloatware (apps UWP)'
    $removidos = 0
    foreach ($pat in $AppsParaRemover) {
        Get-AppxPackage -AllUsers -Name $pat -ErrorAction SilentlyContinue | ForEach-Object {
            try {
                Remove-AppxPackage -Package $_.PackageFullName -AllUsers -ErrorAction Stop
                Write-Ok "Removido: $($_.Name)"; $removidos++
            } catch { Write-Warn2 "Falhou: $($_.Name) - $($_.Exception.Message)" }
        }
        Get-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -like $pat } | ForEach-Object {
                try {
                    Remove-AppxProvisionedPackage -Online -PackageName $_.PackageName -ErrorAction Stop | Out-Null
                    Write-Ok "Desprovisionado (novos usuarios): $($_.DisplayName)"
                } catch { Write-Warn2 "Falhou desprovisionar: $($_.DisplayName)" }
            }
    }
    $Resumo.Add("Apps removidos: $removidos")

    # --- Teams: instalador machine-wide (Win32) e Teams classico do usuario ---
    Write-Step 'Teams e Outlook novo: remocao completa'
    Get-Process -Name 'Teams','ms-teams','olk' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    foreach ($ub in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
                    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*') {
        Get-ItemProperty $ub -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -like 'Teams Machine-Wide Installer*' } | ForEach-Object {
                if ($_.PSChildName -match '^\{[0-9A-Fa-f-]+\}$') {
                    Start-Process msiexec.exe -ArgumentList "/x $($_.PSChildName) /qn /norestart" -Wait
                    Write-Ok 'Teams Machine-Wide Installer removido'
                }
            }
    }
    $teamsUpdate = "$env:LOCALAPPDATA\Microsoft\Teams\Update.exe"
    if (Test-Path $teamsUpdate) {
        Start-Process $teamsUpdate -ArgumentList '--uninstall -s' -Wait
        Write-Ok 'Teams classico removido (usuario atual)'
    }
    # Impede o Windows Update de reinstalar o Outlook novo e o Dev Home
    foreach ($k in 'OutlookUpdate','DevHomeUpdate') {
        $p = "HKLM:\SOFTWARE\Microsoft\WindowsUpdate\Orchestrator\UScheduler_Oobe\$k"
        if (Test-Path $p) { Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue; Write-Ok "Reinstalacao bloqueada: $k" }
    }
    $Resumo.Add('Teams (app, instalador e icone de chat) e Outlook novo removidos, sem reinstalacao automatica')
}

# ------------------------------------------------------------------
# 2. OneDrive
# ------------------------------------------------------------------
if ($RemoverOneDrive) {
    Write-Step 'OneDrive'
    $kfm = @()
    foreach ($f in 'Desktop','MyDocuments','MyPictures') {
        $p = [Environment]::GetFolderPath($f)
        if ($p -like '*OneDrive*') { $kfm += $p }
    }
    if ($kfm.Count -gt 0 -and -not $ForceOneDrive) {
        Write-Warn2 'Pastas do usuario estao redirecionadas para o OneDrive:'
        $kfm | ForEach-Object { Write-Warn2 "   $_" }
        Write-Warn2 'OneDrive NAO sera removido (evita perda de acesso a arquivos). Use -ForceOneDrive apos conferir.'
        $Resumo.Add('OneDrive: PULADO (pastas redirecionadas)')
    } else {
        Get-Process -Name OneDrive -ErrorAction SilentlyContinue | Stop-Process -Force
        $setup = "$env:SystemRoot\SysWOW64\OneDriveSetup.exe"
        if (-not (Test-Path $setup)) { $setup = "$env:SystemRoot\System32\OneDriveSetup.exe" }
        if (Test-Path $setup) {
            Start-Process $setup -ArgumentList '/uninstall' -Wait
            Write-Ok 'OneDrive desinstalado'
        } else { Write-Warn2 'OneDriveSetup.exe nao encontrado (talvez ja removido)' }
        Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\OneDrive' 'DisableFileSyncNGSC' 1
        Set-Reg 'Registry::HKEY_CLASSES_ROOT\CLSID\{018D5C66-4533-4307-9B53-224DE2ED1FE6}' 'System.IsPinnedToNameSpaceTree' 0
        foreach ($d in "$env:LOCALAPPDATA\Microsoft\OneDrive","$env:ProgramData\Microsoft OneDrive","$env:SystemDrive\OneDriveTemp") {
            if (Test-Path $d) { Remove-Item $d -Recurse -Force -ErrorAction SilentlyContinue }
        }
        Get-ChildItem "$env:USERPROFILE" -Directory -Filter 'OneDrive*' -ErrorAction SilentlyContinue |
            Where-Object { -not (Get-ChildItem $_.FullName -Recurse -Force -ErrorAction SilentlyContinue | Select-Object -First 1) } |
            Remove-Item -Force -ErrorAction SilentlyContinue
        $Resumo.Add('OneDrive removido e bloqueado por politica')
    }
}

# ------------------------------------------------------------------
# 3. Edge (neutralizar)
# ------------------------------------------------------------------
if ($NeutralizarEdge) {
    Write-Step 'Edge (neutralizando - nao desinstala)'
    $e = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge'
    Set-Reg $e 'StartupBoostEnabled' 0
    Set-Reg $e 'BackgroundModeEnabled' 0
    Set-Reg $e 'HideFirstRunExperience' 1
    Set-Reg $e 'EdgeShoppingAssistantEnabled' 0
    Set-Reg $e 'HubsSidebarEnabled' 0
    Set-Reg $e 'ShowMicrosoftRewards' 0
    Set-Reg $e 'EdgeFollowEnabled' 0
    Set-Reg $e 'PersonalizationReportingEnabled' 0
    Set-Reg $e 'MetricsReportingEnabled' 0
    Set-Reg $e 'DefaultBrowserSettingEnabled' 0
    Set-Reg $e 'NewTabPageContentEnabled' 0
    Set-Reg $e 'NewTabPageQuickLinksEnabled' 0
    foreach ($p in "$env:PUBLIC\Desktop","$env:USERPROFILE\Desktop") {
        Get-ChildItem $p -Filter 'Microsoft Edge*.lnk' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    }
    Write-Ok 'Politicas do Edge aplicadas; atalhos removidos'
    $Resumo.Add('Edge neutralizado (sem boost, sem segundo plano, sem sidebar/rewards)')
}

# ------------------------------------------------------------------
# 4. Telemetria, sugestoes, Copilot, Recall, widgets
# ------------------------------------------------------------------
if ($DesativarTelemetria) {
    Write-Step 'Telemetria, sugestoes, Copilot, Recall, widgets'
    $pol = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows'
    Set-Reg "$pol\DataCollection" 'AllowTelemetry' 0
    Set-Reg "$pol\DataCollection" 'DoNotShowFeedbackNotifications' 1
    Set-Reg "$pol\CloudContent" 'DisableWindowsConsumerFeatures' 1
    Set-Reg "$pol\CloudContent" 'DisableConsumerAccountStateContent' 1
    Set-Reg "$pol\CloudContent" 'DisableCloudOptimizedContent' 1
    Set-Reg "$pol\Windows Chat" 'ChatIcon' 3
    Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Dsh' 'AllowNewsAndInterests' 0
    Set-Reg "$pol\WindowsCopilot" 'TurnOffWindowsCopilot' 1
    Set-Reg "$pol\WindowsAI" 'DisableAIDataAnalysis' 1
    Set-Reg "$pol\GameDVR" 'AllowGameDVR' 0
    Set-Reg "$pol\AdvertisingInfo" 'DisabledByGroupPolicy' 1
    Set-Reg "$pol\System" 'EnableActivityFeed' 0
    Set-Reg "$pol\System" 'PublishUserActivities' 0
    Set-Reg "$pol\System" 'UploadUserActivities' 0
    Set-Reg "$pol\Windows Search" 'AllowCortana' 0
    Set-Reg "$pol\Windows Search" 'DisableWebSearch' 1
    Set-Reg "$pol\Windows Search" 'ConnectedSearchUseWeb' 0

    # Recall (se a feature existir nesta build)
    Disable-WindowsOptionalFeature -Online -FeatureName 'Recall' -NoRestart -ErrorAction SilentlyContinue | Out-Null

    # Usuario atual
    Set-UserTweaks 'HKCU:'
    # Perfil padrao (usuarios criados depois herdam)
    $defHive = "$env:SystemDrive\Users\Default\NTUSER.DAT"
    if (Test-Path $defHive) {
        & reg.exe load 'HKU\FA_DEFAULT' $defHive | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Set-UserTweaks 'Registry::HKEY_USERS\FA_DEFAULT'
            $runDef = 'Registry::HKEY_USERS\FA_DEFAULT\Software\Microsoft\Windows\CurrentVersion\Run'
            Remove-ItemProperty -Path $runDef -Name 'OneDriveSetup' -ErrorAction SilentlyContinue
            [gc]::Collect(); [gc]::WaitForPendingFinalizers()
            & reg.exe unload 'HKU\FA_DEFAULT' | Out-Null
            Write-Ok 'Ajustes aplicados ao perfil padrao'
        } else { Write-Warn2 'Nao foi possivel carregar o perfil padrao' }
    }
    $Resumo.Add('Telemetria/sugestoes/Copilot/Recall/widgets desativados (usuario atual + novos)')
    Write-Warn2 'Outros usuarios JA existentes nesta maquina precisam rodar o script no proprio login.'
}

# ------------------------------------------------------------------
# 5. Inicializacao: Run keys, servicos, tarefas
# ------------------------------------------------------------------
Write-Step 'Inicializacao'
foreach ($rk in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run',
                'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run',
                'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run') {
    if (Test-Path $rk) {
        $props = (Get-ItemProperty $rk).PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' }
        foreach ($pr in $props) {
            foreach ($pat in $RunParaRemover) {
                if ($pr.Name -like $pat) {
                    Remove-ItemProperty -Path $rk -Name $pr.Name -ErrorAction SilentlyContinue
                    Write-Ok "Removido da inicializacao: $($pr.Name)"
                }
            }
        }
    }
}

if ($AjustarServicos) {
    foreach ($s in $ServicosDesativar) {
        $svc = Get-Service -Name $s -ErrorAction SilentlyContinue
        if ($svc) {
            Stop-Service -Name $s -Force -ErrorAction SilentlyContinue
            Set-Service -Name $s -StartupType Disabled -ErrorAction SilentlyContinue
            Write-Ok "Servico desativado: $s"
        }
    }
    # SysMain (Superfetch) so atrapalha em SSD
    try {
        $disk = Get-Partition -DriveLetter ($env:SystemDrive.TrimEnd(':')) | Get-Disk | Get-PhysicalDisk
        if ($disk.MediaType -eq 'SSD') {
            Stop-Service SysMain -Force -ErrorAction SilentlyContinue
            Set-Service SysMain -StartupType Disabled -ErrorAction SilentlyContinue
            Write-Ok 'SysMain desativado (disco e SSD)'
        } else { Write-Warn2 "SysMain mantido (disco: $($disk.MediaType))" }
    } catch { Write-Warn2 'Nao foi possivel detectar tipo de disco; SysMain mantido' }
    $Resumo.Add('Servicos desnecessarios desativados')
}

foreach ($t in $TarefasDesativar) {
    try {
        Disable-ScheduledTask -TaskPath $t[0] -TaskName $t[1] -ErrorAction Stop | Out-Null
        Write-Ok "Tarefa desativada: $($t[1])"
    } catch { }
}

# ------------------------------------------------------------------
# 6. Energia / desempenho
# ------------------------------------------------------------------
if ($AjustarEnergia) {
    Write-Step 'Energia e desempenho'
    # Desktops da recepcao: nunca suspender em tomada; monitor apaga em 15 min
    & powercfg /change standby-timeout-ac 0
    & powercfg /change monitor-timeout-ac 15
    & powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c 2>$null
    if ($LASTEXITCODE -ne 0) { Write-Warn2 'Plano Alto Desempenho indisponivel; plano atual mantido' }
    # Inicializacao rapida causa problemas com atualizacoes e rede; desligar + hibernacao off
    Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power' 'HiberbootEnabled' 0
    & powercfg /hibernate off
    $Resumo.Add('Energia: sem suspensao em tomada, inicializacao rapida e hibernacao desativadas')
    Write-Ok 'Energia ajustada'
}

# ------------------------------------------------------------------
# 7. Limpeza
# ------------------------------------------------------------------
if ($LimparTemporarios) {
    Write-Step 'Limpando temporarios'
    foreach ($d in $env:TEMP, "$env:SystemRoot\Temp") {
        Get-ChildItem $d -Force -ErrorAction SilentlyContinue |
            Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Ok 'Temporarios limpos'
    $Resumo.Add('Temporarios limpos')
}

# ------------------------------------------------------------------
# Fim
# ------------------------------------------------------------------
Write-Step 'Resumo'
$Resumo | ForEach-Object { Write-Host "  - $_" }
Write-Host "`nLog: $LogFile" -ForegroundColor Gray
Stop-Transcript | Out-Null

# Reinicia o Explorer para refletir taskbar/menu sem relogar
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue

if (-not $NoReboot) {
    $r = Read-Host 'Reiniciar agora para concluir? (S/N)'
    if ($r -match '^[sSyY]') { Restart-Computer -Force }
}
