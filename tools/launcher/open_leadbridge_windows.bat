@echo off
set HTML=C:\LeadBridgeKSO\tools\leadbridge\index.html
set LEGACY_HTML=C:\LeadBridgeKSO\tools\leadbridge\offline_phone_matcher.html

if exist "%HTML%" (
  start "" "%HTML%"
) else if exist "%LEGACY_HTML%" (
  start "" "%LEGACY_HTML%"
) else (
  echo LeadBridge HTML not found.
  echo Expected: %HTML%
  pause
)
