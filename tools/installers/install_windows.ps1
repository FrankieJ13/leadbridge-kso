$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (Test-Path (Join-Path $ScriptDir 'apps')) {
  $SourceRoot = $ScriptDir
} elseif (Test-Path (Join-Path $ScriptDir '..\..\apps')) {
  $SourceRoot = (Resolve-Path (Join-Path $ScriptDir '..\..')).Path
} else {
  $SourceRoot = $ScriptDir
}

$Target = 'C:\LeadBridgeKSO'

Write-Host 'LeadBridge KSO Windows installer' -ForegroundColor Green
Write-Host "Source: $SourceRoot"
Write-Host "Target: $Target"

New-Item -ItemType Directory -Force -Path $Target | Out-Null
New-Item -ItemType Directory -Force -Path "$Target\exports" | Out-Null
New-Item -ItemType Directory -Force -Path "$Target\ocr_results" | Out-Null
New-Item -ItemType Directory -Force -Path "$Target\tools" | Out-Null
New-Item -ItemType Directory -Force -Path "$Target\archives" | Out-Null
New-Item -ItemType Directory -Force -Path "$Target\launchers" | Out-Null

function Copy-CleanDir($Source, $Destination) {
  if (Test-Path $Destination) {
    Remove-Item $Destination -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  Copy-Item (Join-Path $Source '*') $Destination -Recurse -Force
}

if (Test-Path (Join-Path $SourceRoot 'apps\leadbridge-web')) {
  Copy-CleanDir (Join-Path $SourceRoot 'apps\leadbridge-web') "$Target\tools\leadbridge"
} else {
  Copy-CleanDir (Join-Path $SourceRoot 'tools\leadbridge') "$Target\tools\leadbridge"
}

if (Test-Path (Join-Path $SourceRoot 'apps\max-chat-local-exporter')) {
  Copy-CleanDir (Join-Path $SourceRoot 'apps\max-chat-local-exporter') "$Target\tools\max-chat-local-exporter"
} else {
  Copy-CleanDir (Join-Path $SourceRoot 'tools\max-chat-local-exporter') "$Target\tools\max-chat-local-exporter"
}

if (Test-Path (Join-Path $SourceRoot 'apps\max-chat-ocr-postprocessor')) {
  Copy-CleanDir (Join-Path $SourceRoot 'apps\max-chat-ocr-postprocessor') "$Target\tools\max-chat-ocr-postprocessor"
} else {
  Copy-CleanDir (Join-Path $SourceRoot 'tools\max-chat-ocr-postprocessor') "$Target\tools\max-chat-ocr-postprocessor"
}

if (Test-Path (Join-Path $SourceRoot 'releases\packages')) {
  Copy-Item (Join-Path $SourceRoot 'releases\packages\*') "$Target\archives" -Recurse -Force
} elseif (Test-Path (Join-Path $SourceRoot 'archives')) {
  Copy-Item (Join-Path $SourceRoot 'archives\*') "$Target\archives" -Recurse -Force
}

if (Test-Path (Join-Path $SourceRoot 'tools\launcher')) {
  Copy-Item (Join-Path $SourceRoot 'tools\launcher\open_leadbridge_windows.bat') "$Target\launchers\open_leadbridge.bat" -Force
  Copy-Item (Join-Path $SourceRoot 'tools\launcher\run_ocr_windows.bat') "$Target\launchers\run_ocr_windows.bat" -Force
} elseif (Test-Path (Join-Path $SourceRoot 'launchers')) {
  Copy-Item (Join-Path $SourceRoot 'launchers\open_leadbridge.bat') "$Target\launchers\open_leadbridge.bat" -Force
  Copy-Item (Join-Path $SourceRoot 'launchers\run_ocr_windows.bat') "$Target\launchers\run_ocr_windows.bat" -Force
}

if (Test-Path (Join-Path $SourceRoot 'README_FIRST.txt')) {
  Copy-Item (Join-Path $SourceRoot 'README_FIRST.txt') "$Target\README_FIRST.txt" -Force
} elseif (Test-Path (Join-Path $SourceRoot 'README.md')) {
  Copy-Item (Join-Path $SourceRoot 'README.md') "$Target\README_FIRST.txt" -Force
}

$PyCmd = $null
if (Get-Command py -ErrorAction SilentlyContinue) { $PyCmd = 'py' }
elseif (Get-Command python -ErrorAction SilentlyContinue) { $PyCmd = 'python' }

if ($PyCmd) {
  Write-Host 'Installing Python requirements...' -ForegroundColor Cyan
  & $PyCmd -m pip install -r "$Target\tools\max-chat-ocr-postprocessor\requirements.txt"
} else {
  Write-Host 'Python not found. Install Python 3, then run:' -ForegroundColor Yellow
  Write-Host "py -m pip install -r $Target\tools\max-chat-ocr-postprocessor\requirements.txt"
}

if (-not (Get-Command tesseract -ErrorAction SilentlyContinue)) {
  Write-Host 'Tesseract not found.' -ForegroundColor Yellow
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host 'Trying to install Tesseract via winget...' -ForegroundColor Cyan
    try {
      winget install --id UB-Mannheim.TesseractOCR -e --accept-package-agreements --accept-source-agreements
    } catch {
      Write-Host 'winget install failed. Install Tesseract manually.' -ForegroundColor Yellow
    }
  } else {
    Write-Host 'Install Tesseract OCR manually and make sure tesseract.exe is in PATH.' -ForegroundColor Yellow
  }
} else {
  Write-Host 'Tesseract found.' -ForegroundColor Green
}

Write-Host ''
Write-Host 'Installed.' -ForegroundColor Green
Write-Host "Open: $Target\launchers\open_leadbridge.bat"
Write-Host "OCR:  $Target\launchers\run_ocr_windows.bat"
Write-Host "Chrome extension folder: $Target\tools\max-chat-local-exporter"
Read-Host 'Press Enter to exit'
