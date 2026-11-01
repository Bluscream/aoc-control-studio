param (
    [string]$Type = "all" # "portable", "nsis", "msi", "all"
)

$ErrorActionPreference = "Stop"

# Garante ferramentas no PATH
$mingwBin = "C:\Users\erick\AppData\Local\Microsoft\WinGet\Packages\BrechtSanders.WinLibs.POSIX.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\mingw64\bin"
if (Test-Path $mingwBin) {
    $env:PATH = "$env:USERPROFILE\.cargo\bin;$mingwBin;$env:PATH"
} else {
    $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
}

# Resolve caminhos usando caminhos curtos (8.3) para evitar erros do windres com espaços
$rootShort = (Get-Item -LiteralPath ".").FullName
try {
    $fso = New-Object -ComObject Scripting.FileSystemObject
    $rootShort = $fso.GetFolder($rootShort).ShortPath
} catch {}

# Usa diretório de target em pasta temporária sem espaços
$env:CARGO_TARGET_DIR = "$env:TEMP\aoc_target"

Write-Host ">>> [1/3] Compilando frontend..." -ForegroundColor Cyan
pnpm build

$manifestPath = "$rootShort\src-tauri\Cargo.toml"
$distDir = ".\Distribuicao"
New-Item -ItemType Directory -Path $distDir -Force | Out-Null

if ($Type -eq "portable" -or $Type -eq "all") {
    Write-Host ">>> [2/3] Compilando binário portátil..." -ForegroundColor Cyan
    cargo build --release --manifest-path $manifestPath --bin app
    
    $binSource = "$env:TEMP\aoc_target\release\app.exe"
    Copy-Item $binSource -Destination ".\AOC-Control-Studio.exe" -Force
    
    $portDir = "$distDir\AOC-Control-Studio-Portable"
    New-Item -ItemType Directory -Path $portDir -Force | Out-Null
    Copy-Item ".\AOC-Control-Studio.exe" -Destination "$portDir\AOC-Control-Studio.exe" -Force
    Copy-Item ".\WebView2Loader.dll" -Destination "$portDir\WebView2Loader.dll" -Force
    
    Compress-Archive -Path "$portDir\*" -DestinationPath "$distDir\AOC-Control-Studio-Portable.zip" -Force
    Remove-Item -Recurse -Force $portDir
    Write-Host " [OK] Versao Portatil gerada em: $distDir\AOC-Control-Studio-Portable.zip" -ForegroundColor Green
}

if ($Type -eq "nsis" -or $Type -eq "all") {
    Write-Host ">>> [3/3] Gerando Instalador Setup (.exe)..." -ForegroundColor Cyan
    pnpm tauri build --bundles nsis
    
    $nsisSource = Get-ChildItem "$env:TEMP\aoc_target\*\release\bundle\nsis\*.exe" | Select-Object -First 1
    if ($nsisSource) {
        Copy-Item $nsisSource.FullName -Destination "$distDir\AOC-Control-Studio-Setup.exe" -Force
        Write-Host " [OK] Instalador Setup gerado em: $distDir\AOC-Control-Studio-Setup.exe" -ForegroundColor Green
    }
}

if ($Type -eq "msi" -or $Type -eq "all") {
    Write-Host ">>> [Extra] Gerando Pacote MSI..." -ForegroundColor Cyan
    pnpm tauri build --bundles msi
    
    $msiSource = Get-ChildItem "$env:TEMP\aoc_target\*\release\bundle\msi\*.msi" | Select-Object -First 1
    if ($msiSource) {
        Copy-Item $msiSource.FullName -Destination "$distDir\AOC-Control-Studio.msi" -Force
        Write-Host " [OK] Pacote MSI gerado em: $distDir\AOC-Control-Studio.msi" -ForegroundColor Green
    }
}

Write-Host ">>> Todos os pacotes solicitados foram gerados na pasta .\Distribuicao!" -ForegroundColor Yellow
