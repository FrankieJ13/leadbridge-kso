$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Join-Path $Root 'LeadBridgeKSO.Windows'
$Project = Join-Path $ProjectDir 'LeadBridgeKSO.Windows.csproj'
$WebDir = Join-Path $ProjectDir 'Web'
$RepoRoot = Resolve-Path (Join-Path $Root '..\..') -ErrorAction SilentlyContinue
$Version = 'v8.2.10.0848'
$PublishDir = Join-Path $Root "dist\LeadBridgeKSO-Windows-WPF-$Version"
$ZipPath = Join-Path $Root "dist\LeadBridgeKSO-Windows-WPF-$Version.zip"

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

dotnet restore $Project
dotnet publish $Project -c Release -r win-x64 --self-contained false -o $PublishDir

if (Test-Path $ZipPath) {
  Remove-Item $ZipPath -Force
}
Compress-Archive -Path (Join-Path $PublishDir '*') -DestinationPath $ZipPath -Force

Write-Host ''
Write-Host "Built: $PublishDir" -ForegroundColor Green
Write-Host "ZIP:   $ZipPath" -ForegroundColor Green
