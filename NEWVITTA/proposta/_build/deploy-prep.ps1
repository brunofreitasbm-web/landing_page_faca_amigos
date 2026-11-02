param(
  # ID do Google (G-XXXXXXXXXX). Vai só para a cópia em _deploy; o arquivo-fonte não muda.
  [string]$GaId = "",
  # Endereço público do site. O WhatsApp só mostra a miniatura com URL absoluta.
  # Confirme no primeiro deploy: se a Vercel der outro endereço, rode de novo com ele.
  [string]$SiteUrl = "https://newvita-belem.vercel.app"
)

$here = $PSScriptRoot
$root = Split-Path -Parent $here                 # NEWVITTA\proposta
$deploy = Join-Path $root "_deploy"              # única pasta que a Vercel enxerga
$img = Join-Path (Split-Path -Parent $root) "img"

New-Item -ItemType Directory -Force (Join-Path $deploy "img") | Out-Null

$html = [IO.File]::ReadAllText((Join-Path $root "proposta-newvita-mobile.html"), [Text.Encoding]::UTF8)
$html = $html.Replace('../img/', 'img/').Replace('__SITE_URL__', $SiteUrl.TrimEnd('/'))
if ($GaId) {
  if ($GaId -notmatch '^(G|GT)-[A-Z0-9]+$') { throw "GaId inválido: use o formato G-XXXXXXXXXX" }
  $html = $html.Replace('[FILL: Google tracking ID]', $GaId)
}
[IO.File]::WriteAllText((Join-Path $deploy "index.html"), $html, (New-Object Text.UTF8Encoding($false)))

Get-ChildItem $img -Filter "ig-*.jpg" | Copy-Item -Destination (Join-Path $deploy "img") -Force
Copy-Item (Join-Path $root "anexo\amostra-tv-newvita.html") $deploy -Force
Copy-Item (Join-Path $root "proposta-newvita-mobile.pdf") $deploy -Force

# Miniatura do link (1200x630): o Chrome grava em pasta temporária ASCII por causa do "ç" no caminho.
$tmp = Join-Path $env:TEMP "newvita-build"
New-Item -ItemType Directory -Force $tmp | Out-Null
$ogUrl = ([Uri](Join-Path $here "og-card.html")).AbsoluteUri
Remove-Item "$tmp\og.png" -ErrorAction SilentlyContinue
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,630 --virtual-time-budget=10000 --screenshot="$tmp\og.png" $ogUrl 2>$null | Out-Null
if (-not (Test-Path "$tmp\og.png")) { throw "não gerou a miniatura og-newvita.png" }
Copy-Item "$tmp\og.png" (Join-Path $root "og-newvita.png") -Force
Copy-Item "$tmp\og.png" (Join-Path $deploy "og-newvita.png") -Force

$config = @'
{
  "headers": [
    { "source": "/(.*)", "headers": [ { "key": "X-Robots-Tag", "value": "noindex, nofollow" } ] }
  ]
}
'@
[IO.File]::WriteAllText((Join-Path $deploy "vercel.json"), $config, (New-Object Text.UTF8Encoding($false)))

Write-Output "Pasta de deploy pronta: $deploy"
Get-ChildItem $deploy -Recurse -File | ForEach-Object { "  " + $_.FullName.Substring($deploy.Length + 1) }
Write-Output ""
Write-Output "Próximos passos (nada foi enviado à Vercel):"
Write-Output "  npm i -g vercel"
Write-Output "  cd `"$deploy`""
Write-Output '  $env:VERCEL_TOKEN = "[FILL: Vercel token]"      # só na sessão, nunca em arquivo'
Write-Output '  vercel link --yes --project newvita-belem --token $env:VERCEL_TOKEN'
Write-Output '  vercel deploy --prod --yes --token $env:VERCEL_TOKEN'
