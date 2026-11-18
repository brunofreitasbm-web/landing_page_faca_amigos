param(
  [string]$Name = "proposta-newvita-mobile",
  [int]$Pages = 19,
  [switch]$SemAnexo,
  [string]$Titulo = "",
  # Endereço público: entra nos links absolutos do PDF (ex.: botão "Abrir em tela cheia").
  [string]$SiteUrl = "https://newvita-belem.vercel.app"
)

$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$here = $PSScriptRoot
$root = Split-Path -Parent $here
$tmp = Join-Path $env:TEMP "newvita-build"
New-Item -ItemType Directory -Force $tmp | Out-Null

# Cópia só para impressão: troca __SITE_URL__ pelo endereço real, sem mexer no fonte.
$printCopy = Join-Path $root "_print-$Name.html"
$fonte = [IO.File]::ReadAllText((Join-Path $root "$Name.html"), [Text.Encoding]::UTF8)
[IO.File]::WriteAllText($printCopy, $fonte.Replace('__SITE_URL__', $SiteUrl.TrimEnd('/')), (New-Object Text.UTF8Encoding($false)))
$url = ([Uri]$printCopy).AbsoluteUri

if (-not (Test-Path (Join-Path $here "node_modules\pdf-lib"))) {
  Push-Location $here; npm install pdf-lib; Pop-Location
}

try {
  # O caminho tem "ç": o Chrome recebe a URL codificada e grava em pasta temporária ASCII.
  & $chrome --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=15000 --print-to-pdf="$tmp\base.pdf" $url 2>$null | Out-Null

  # --dump-dom só devolve texto com Start-Process; com ">" a saída vem vazia.
  Start-Process -FilePath $chrome -ArgumentList @("--headless=new", "--disable-gpu", "--window-size=409,725", "--virtual-time-budget=15000", "--dump-dom", $url) -RedirectStandardOutput "$tmp\dom.html" -RedirectStandardError "$tmp\dom.err" -Wait -NoNewWindow
  $dom = [IO.File]::ReadAllText("$tmp\dom.html", [Text.Encoding]::UTF8)
  $m = [regex]::Match($dom, 'id="rects">(.*?)</script>', 'Singleline')
  if (-not $m.Success) { throw "não achei os retângulos das caixas de seleção no DOM" }
  [IO.File]::WriteAllText("$tmp\rects.json", $m.Groups[1].Value)
}
finally {
  Remove-Item $printCopy -ErrorAction SilentlyContinue
}

Push-Location $here
# Anexo dinâmico: cópia autocontida do new.html (fotos e QR embutidos), gravada na pasta anexo e dentro do PDF.
if ($SemAnexo) {
  node finalize.js "$tmp\base.pdf" "$tmp\rects.json" "$tmp\out.pdf" $Pages "-" $Titulo
} else {
  node inline-anexo.js
  node finalize.js "$tmp\base.pdf" "$tmp\rects.json" "$tmp\out.pdf" $Pages (Join-Path $root "anexo\amostra-tv-newvita.html") $Titulo
}
Pop-Location

Copy-Item "$tmp\out.pdf" (Join-Path $root "$Name.pdf") -Force
Write-Output "PDF: $(Join-Path $root "$Name.pdf")"
