$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Join-Path $Root 'LeadBridgeKSO.Windows'
$Project = Join-Path $ProjectDir 'LeadBridgeKSO.Windows.csproj'
$WebDir = Join-Path $ProjectDir 'Web'
$RepoRoot = Resolve-Path (Join-Path $Root '..\..') -ErrorAction SilentlyContinue
$Version = 'v6.4.24.1144'
$PublishDir = Join-Path $Root "dist\LeadBridgeKSO-Windows-WPF-$Version"
$ZipPath = Join-Path $Root "dist\LeadBridgeKSO-Windows-WPF-$Version.zip"

function Copy-WebAssets {
  if (Test-Path (Join-Path $WebDir 'index.html')) {
    return
  }
  if (-not $RepoRoot -or -not (Test-Path (Join-Path $RepoRoot 'index.html'))) {
    throw 'Web/index.html is missing. Build from the generated ZIP package or from the repository root.'
  }

  New-Item -ItemType Directory -Force -Path $WebDir | Out-Null
  Copy-Item (Join-Path $RepoRoot 'index.html') (Join-Path $WebDir 'index.html') -Force
  if (Test-Path (Join-Path $RepoRoot 'releases')) {
    Copy-Item (Join-Path $RepoRoot 'releases') (Join-Path $WebDir 'releases') -Recurse -Force
  }
}

Copy-WebAssets

if (Test-Path $PublishDir) {
  Remove-Item $PublishDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $PublishDir) | Out-Null

dotnet restore $Project
dotnet publish $Project -c Release -r win-x64 --self-contained false -o $PublishDir

if (Test-Path $ZipPath) {
  Remove-Item $ZipPath -Force
}
Compress-Archive -Path (Join-Path $PublishDir '*') -DestinationPath $ZipPath -Force

Write-Host ''
Write-Host "Built: $PublishDir" -ForegroundColor Green
Write-Host "ZIP:   $ZipPath" -ForegroundColor Green
