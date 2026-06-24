#!/bin/bash
set -e

OCR="$HOME/LeadBridgeKSO/tools/max-chat-ocr-postprocessor/max_chat_ocr.py"
OUT="$HOME/LeadBridgeKSO/ocr_results"

if [ ! -f "$OCR" ]; then
  echo "OCR script not found: $OCR"
  read -n 1 -s -r -p "Press any key to close"
  exit 1
fi

echo "Put MAX ZIP exports into ~/LeadBridgeKSO/exports"
read -r -p "Enter full path to MAX ZIP or extracted folder: " INPUT
if [ -z "$INPUT" ]; then
  exit 1
fi

python3 "$OCR" "$INPUT" --output "$OUT"
echo
echo "Done. Use messages_ocr.json from ~/LeadBridgeKSO/ocr_results in LeadBridge."
read -n 1 -s -r -p "Press any key to close"
