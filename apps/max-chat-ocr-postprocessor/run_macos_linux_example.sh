#!/usr/bin/env bash
set -euo pipefail
if [ $# -lt 1 ]; then
  echo "Использование: ./run_macos_linux_example.sh /path/to/MAX_CHAT_EXPORT.zip"
  exit 1
fi
python3 max_chat_ocr.py "$1"
