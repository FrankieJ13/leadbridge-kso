param(
  [switch]$InstallDependencies
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Join-Path $Root 'LeadBridgeKSO.Windows'
$Project = Join-Path $ProjectDir 'LeadBridgeKSO.Windows.csproj'
$WebDir = Join-Path $ProjectDir 'Web'
$RepoRoot = Resolve-Path (Join-Path $Root '..\..') -ErrorAction SilentlyContinue
$Version = 'v8.2.10.0848'
$PublishDir = Join-Path $Root "dist\LeadBridgeKSO-Windows-WPF-$Version"
$ZipPath = Join-Path $Root "dist\LeadBridgeKSO-Windows-WPF-$Version.zip"

function Find-Dotnet {
  $Command = Get-Command dotnet -ErrorAction SilentlyContinue
  if ($Command) {
    return $Command.Source
  }

  $DefaultPath = Join-Path $env:ProgramFiles 'dotnet\dotnet.exe'
  if (Test-Path $DefaultPath -PathType Leaf) {
    return $DefaultPath
  }
  return $null
}

function Test-DotnetSdk8($DotnetPath) {
  if (-not $DotnetPath) {
    return $false
  }
  try {
    $Sdks = @(& $DotnetPath --list-sdks 2>$null)
    return [bool]($Sdks | Where-Object { $_ -match '^(?:[89]|[1-9][0-9]+)\.' })
  } catch {
    return $false
  }
}

$Dotnet = Find-Dotnet
if (-not (Test-DotnetSdk8 $Dotnet)) {
  if ($InstallDependencies) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
      throw 'winget is unavailable. Install the .NET 8 SDK from https://dotnet.microsoft.com/download/dotnet/8.0 and run build.ps1 again.'
    }
    Write-Host 'Installing .NET 8 SDK...' -ForegroundColor Cyan
    winget install --id Microsoft.DotNet.SDK.8 -e --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
      throw 'The .NET 8 SDK installation failed. Install it manually and run build.ps1 again.'
    }
    $Dotnet = Find-Dotnet
  }

  if (-not (Test-DotnetSdk8 $Dotnet)) {
    Write-Host ''
    Write-Host '.NET SDK 8 or newer is required to build the Windows WPF application.' -ForegroundColor Red
    Write-Host 'Automatic installation:' -ForegroundColor Yellow
    Write-Host 'powershell -ExecutionPolicy Bypass -File .\build.ps1 -InstallDependencies' -ForegroundColor Cyan
    Write-Host 'Or install it manually: winget install --id Microsoft.DotNet.SDK.8 -e' -ForegroundColor Yellow
    Write-Host 'After installation, reopen PowerShell and run build.ps1 again.'
    exit 2
  }
}

function Copy-WebAssets {
  if (Test-Path (Join-Path $WebDir 'index.html')) {
    return
  }
  $CanonicalWeb = if ($RepoRoot) { Join-Path $RepoRoot 'apps\leadbridge-web' } else { $null }
  if (-not $CanonicalWeb -or -not (Test-Path (Join-Path $CanonicalWeb 'index.html'))) {
    throw 'Web/index.html is missing. Build from the generated ZIP package or from the repository root.'
  }

  Copy-Item $CanonicalWeb $WebDir -Recurse -Force
}

Copy-WebAssets

if (Test-Path $PublishDir) {
  Remove-Item $PublishDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $PublishDir) | Out-Null

& $Dotnet restore $Project
& $Dotnet publish $Project -c Release -r win-x64 --self-contained false -o $PublishDir

if (Test-Path $ZipPath) {
  Remove-Item $ZipPath -Force
}
Compress-Archive -Path (Join-Path $PublishDir '*') -DestinationPath $ZipPath -Force

Write-Host ''
Write-Host "Built: $PublishDir" -ForegroundColor Green
Write-Host "ZIP:   $ZipPath" -ForegroundColor Green
