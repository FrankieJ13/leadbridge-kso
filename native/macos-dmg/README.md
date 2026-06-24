# LeadBridge KSO macOS Native DMG Build

This package builds a native macOS desktop shell for LeadBridge KSO.

The app uses AppKit + WKWebView. It opens the published GitHub Pages app by default:

```text
https://frankiej13.github.io/leadbridge-kso/
```

If GitHub Pages is unavailable, it can load the bundled offline `Web/index.html` copy. MAX, amoCRM and attachment files are still selected by the operator and processed locally by WKWebView.

## Requirements

- macOS with Xcode command line tools
- `swiftc`
- `hdiutil`

Install command line tools if needed:

```bash
xcode-select --install
```

## Build

Run from this folder:

```bash
chmod +x build_dmg.sh
./build_dmg.sh
```

Output:

```text
build/LeadBridge KSO.app
dist/LeadBridgeKSO-macOS-DMG-v6.4.24.1144.dmg
```

## Distribution Note

The script creates an unsigned local build. For broad distribution outside your own machines, sign and notarize the app with an Apple Developer ID before sharing the DMG.

## Configuration

Change the GitHub Pages URL in:

```text
Sources/LeadBridgeKSOApp.swift
```

The build package includes `Web/index.html` for offline fallback. When building directly from the repository, `build_dmg.sh` hydrates that folder from the repository root.
