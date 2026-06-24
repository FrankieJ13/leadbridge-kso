# LeadBridge KSO Windows WPF Native Build

This package builds a native Windows desktop shell for LeadBridge KSO.

The app uses WPF + Microsoft Edge WebView2. It opens the published GitHub Pages app by default:

```text
https://frankiej13.github.io/leadbridge-kso/
```

If GitHub Pages is unavailable, it can load the bundled offline `Web/index.html` copy. MAX, amoCRM and attachment files are still selected by the operator and processed locally by WebView2.

## Requirements

- Windows 10/11
- .NET SDK 8 or newer
- Microsoft Edge WebView2 Runtime, usually already installed with Edge

## Build

Run PowerShell from this folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

Output:

```text
dist\LeadBridgeKSO-Windows-WPF-v6.4.24.1144\
dist\LeadBridgeKSO-Windows-WPF-v6.4.24.1144.zip
```

## Configuration

Change the GitHub Pages URL in:

```text
LeadBridgeKSO.Windows\AppSettings.cs
```

The build package includes `LeadBridgeKSO.Windows\Web\index.html` for offline fallback. When building directly from the repository, `build.ps1` hydrates that folder from the repository root.
