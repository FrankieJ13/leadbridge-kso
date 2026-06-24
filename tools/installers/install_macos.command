#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -d "$SCRIPT_DIR/apps" ]; then
  SOURCE_ROOT="$SCRIPT_DIR"
elif [ -d "$SCRIPT_DIR/../../apps" ]; then
  SOURCE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
else
  SOURCE_ROOT="$SCRIPT_DIR"
fi

TARGET="$HOME/LeadBridgeKSO"

echo "LeadBridge KSO macOS installer"
echo "Source: $SOURCE_ROOT"
echo "Target: $TARGET"

mkdir -p "$TARGET/exports" "$TARGET/ocr_results" "$TARGET/tools" "$TARGET/archives" "$TARGET/launchers"

copy_dir() {
  SRC="$1"
  DST="$2"
  if [ -d "$DST" ]; then
    rm -rf "$DST"
  fi
  mkdir -p "$(dirname "$DST")"
  rsync -a "$SRC/" "$DST/"
}

if [ -d "$SOURCE_ROOT/apps/leadbridge-web" ]; then
  copy_dir "$SOURCE_ROOT/apps/leadbridge-web" "$TARGET/tools/leadbridge"
else
  copy_dir "$SOURCE_ROOT/tools/leadbridge" "$TARGET/tools/leadbridge"
fi

if [ -d "$SOURCE_ROOT/apps/max-chat-local-exporter" ]; then
  copy_dir "$SOURCE_ROOT/apps/max-chat-local-exporter" "$TARGET/tools/max-chat-local-exporter"
else
  copy_dir "$SOURCE_ROOT/tools/max-chat-local-exporter" "$TARGET/tools/max-chat-local-exporter"
fi

if [ -d "$SOURCE_ROOT/apps/max-chat-ocr-postprocessor" ]; then
  copy_dir "$SOURCE_ROOT/apps/max-chat-ocr-postprocessor" "$TARGET/tools/max-chat-ocr-postprocessor"
else
  copy_dir "$SOURCE_ROOT/tools/max-chat-ocr-postprocessor" "$TARGET/tools/max-chat-ocr-postprocessor"
fi

if [ -d "$SOURCE_ROOT/releases/packages" ]; then
  rsync -a "$SOURCE_ROOT/releases/packages/" "$TARGET/archives/"
elif [ -d "$SOURCE_ROOT/archives" ]; then
  rsync -a "$SOURCE_ROOT/archives/" "$TARGET/archives/"
fi

if [ -d "$SOURCE_ROOT/tools/launcher" ]; then
  cp "$SOURCE_ROOT/tools/launcher/open_leadbridge.command" "$TARGET/launchers/open_leadbridge.command"
  cp "$SOURCE_ROOT/tools/launcher/run_ocr_macos.command" "$TARGET/launchers/run_ocr_macos.command"
elif [ -d "$SOURCE_ROOT/launchers" ]; then
  cp "$SOURCE_ROOT/launchers/open_leadbridge.command" "$TARGET/launchers/open_leadbridge.command"
  cp "$SOURCE_ROOT/launchers/run_ocr_macos.command" "$TARGET/launchers/run_ocr_macos.command"
fi
chmod +x "$TARGET/launchers/open_leadbridge.command" "$TARGET/launchers/run_ocr_macos.command"

if [ -f "$SOURCE_ROOT/README_FIRST.txt" ]; then
  cp "$SOURCE_ROOT/README_FIRST.txt" "$TARGET/README_FIRST.txt"
elif [ -f "$SOURCE_ROOT/README.md" ]; then
  cp "$SOURCE_ROOT/README.md" "$TARGET/README_FIRST.txt"
fi

if command -v brew >/dev/null 2>&1; then
  echo "Homebrew found. Installing/checking Tesseract..."
  brew list tesseract >/dev/null 2>&1 || brew install tesseract
  brew list tesseract-lang >/dev/null 2>&1 || brew install tesseract-lang
else
  echo "Homebrew not found. Install Homebrew, then run:"
  echo "brew install tesseract tesseract-lang"
fi

if command -v python3 >/dev/null 2>&1; then
  echo "Installing Python requirements..."
  python3 -m pip install -r "$TARGET/tools/max-chat-ocr-postprocessor/requirements.txt" || python3 -m pip install --break-system-packages -r "$TARGET/tools/max-chat-ocr-postprocessor/requirements.txt"
else
  echo "python3 not found. Install Python 3."
fi

echo
echo "Installed."
echo "Open: $TARGET/launchers/open_leadbridge.command"
echo "OCR:  $TARGET/launchers/run_ocr_macos.command"
echo "Chrome extension folder: $TARGET/tools/max-chat-local-exporter"
read -n 1 -s -r -p "Press any key to close"
