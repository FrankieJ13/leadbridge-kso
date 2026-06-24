#!/bin/bash
set -e

HTML="$HOME/LeadBridgeKSO/tools/leadbridge/index.html"
LEGACY_HTML="$HOME/LeadBridgeKSO/tools/leadbridge/offline_phone_matcher.html"

if [ -f "$HTML" ]; then
  open "$HTML"
elif [ -f "$LEGACY_HTML" ]; then
  open "$LEGACY_HTML"
else
  echo "LeadBridge HTML not found."
  echo "Expected: $HTML"
  read -n 1 -s -r -p "Press any key to close"
fi
