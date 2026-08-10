#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." 2>/dev/null && pwd || true)"
VERSION="v8.2.10.0848"
MARKETING_VERSION="8.2.10"
BUILD_VERSION="848"
MIN_MACOS_VERSION="12.0"
APP_NAME="LeadBridge KSO"
BUNDLE_ID="ru.leadbridge.kso"
EXECUTABLE="LeadBridgeKSO"
WEB_DIR="$ROOT/Web"
BUILD_DIR="$ROOT/build"
DIST_DIR="$ROOT/dist"
APP_DIR="$BUILD_DIR/$APP_NAME.app"
DMG_STAGE="$BUILD_DIR/dmg-stage"
DMG_PATH="$DIST_DIR/LeadBridgeKSO-macOS-DMG-$VERSION.dmg"
MODULE_CACHE="$BUILD_DIR/module-cache"

hydrate_web_assets() {
  CANONICAL_WEB="$REPO_ROOT/apps/leadbridge-web"
  if [ -f "$CANONICAL_WEB/index.html" ]; then
    rm -rf "$WEB_DIR"
    mkdir -p "$WEB_DIR"
    cp -R "$CANONICAL_WEB/." "$WEB_DIR/"
    rm -rf "$WEB_DIR/releases"
    return
  fi

  if [ -f "$WEB_DIR/index.html" ]; then
    return
  fi

  echo "Web/index.html is missing. Build from the generated ZIP package or from the repository root." >&2
  exit 1
}

hydrate_web_assets

rm -rf "$BUILD_DIR"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources/Web" "$DIST_DIR" "$DMG_STAGE" "$MODULE_CACHE"

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
  <key>CFBundleDisplayName</key>
  <string>$APP_NAME</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>$MARKETING_VERSION</string>
  <key>CFBundleVersion</key>
  <string>$BUILD_VERSION</string>
  <key>LeadBridgeFullVersion</key>
  <string>${VERSION#v}</string>
  <key>LSApplicationCategoryType</key>
  <string>public.app-category.business</string>
  <key>LSMinimumSystemVersion</key>
  <string>$MIN_MACOS_VERSION</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

ARM64_EXECUTABLE="$BUILD_DIR/$EXECUTABLE-arm64"
X86_64_EXECUTABLE="$BUILD_DIR/$EXECUTABLE-x86_64"

CLANG_MODULE_CACHE_PATH="$MODULE_CACHE" swiftc -O \
  -target "arm64-apple-macosx$MIN_MACOS_VERSION" \
  -framework Cocoa -framework WebKit \
  "$ROOT/Sources/LeadBridgeKSOApp.swift" -o "$ARM64_EXECUTABLE"
CLANG_MODULE_CACHE_PATH="$MODULE_CACHE" swiftc -O \
  -target "x86_64-apple-macosx$MIN_MACOS_VERSION" \
  -framework Cocoa -framework WebKit \
  "$ROOT/Sources/LeadBridgeKSOApp.swift" -o "$X86_64_EXECUTABLE"
lipo -create "$ARM64_EXECUTABLE" "$X86_64_EXECUTABLE" -output "$APP_DIR/Contents/MacOS/$EXECUTABLE"
chmod +x "$APP_DIR/Contents/MacOS/$EXECUTABLE"
codesign --force --deep --sign - --timestamp=none "$APP_DIR"

cp -R "$APP_DIR" "$DMG_STAGE/$APP_NAME.app"
ln -s /Applications "$DMG_STAGE/Applications"

rm -f "$DMG_PATH"
hdiutil create -volname "$APP_NAME" -srcfolder "$DMG_STAGE" -ov -format UDZO "$DMG_PATH"

echo
echo "Built: $APP_DIR"
echo "DMG:   $DMG_PATH"
echo "Architectures: $(lipo -archs "$APP_DIR/Contents/MacOS/$EXECUTABLE")"
echo "Minimum macOS: $MIN_MACOS_VERSION"
