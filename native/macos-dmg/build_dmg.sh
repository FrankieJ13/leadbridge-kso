#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." 2>/dev/null && pwd || true)"
VERSION="v8.2.10.0848"
APP_NAME="LeadBridge KSO"
BUNDLE_ID="ru.leadbridge.kso"
EXECUTABLE="LeadBridgeKSO"
WEB_DIR="$ROOT/Web"
BUILD_DIR="$ROOT/build"
DIST_DIR="$ROOT/dist"
APP_DIR="$BUILD_DIR/$APP_NAME.app"
DMG_STAGE="$BUILD_DIR/dmg-stage"
DMG_PATH="$DIST_DIR/LeadBridgeKSO-macOS-DMG-$VERSION.dmg"

hydrate_web_assets() {
  if [ -f "$WEB_DIR/index.html" ]; then
    return
  fi
  CANONICAL_WEB="$REPO_ROOT/apps/leadbridge-web"
  if [ ! -f "$CANONICAL_WEB/index.html" ]; then
    echo "Web/index.html is missing. Build from the generated ZIP package or from the repository root." >&2
    exit 1
  fi

  mkdir -p "$WEB_DIR"
  cp -R "$CANONICAL_WEB/." "$WEB_DIR/"
  rm -rf "$WEB_DIR/releases"
}

hydrate_web_assets

rm -rf "$BUILD_DIR"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources/Web" "$DIST_DIR" "$DMG_STAGE"

cp -R "$WEB_DIR/." "$APP_DIR/Contents/Resources/Web/"

cat > "$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>ru</string>
  <key>CFBundleExecutable</key>
  <string>$EXECUTABLE</string>
  <key>CFBundleIdentifier</key>
  <string>$BUNDLE_ID</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$APP_NAME</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${VERSION#v}</string>
  <key>CFBundleVersion</key>
  <string>${VERSION#v}</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

swiftc -O -framework Cocoa -framework WebKit "$ROOT/Sources/LeadBridgeKSOApp.swift" -o "$APP_DIR/Contents/MacOS/$EXECUTABLE"
chmod +x "$APP_DIR/Contents/MacOS/$EXECUTABLE"

cp -R "$APP_DIR" "$DMG_STAGE/$APP_NAME.app"
ln -s /Applications "$DMG_STAGE/Applications"

rm -f "$DMG_PATH"
hdiutil create -volname "$APP_NAME" -srcfolder "$DMG_STAGE" -ov -format UDZO "$DMG_PATH"

echo
echo "Built: $APP_DIR"
echo "DMG:   $DMG_PATH"
