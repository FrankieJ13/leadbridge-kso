import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class WindowsDistributionTests(unittest.TestCase):
    def test_installer_validates_complete_payload_before_writing_target(self):
        script = (ROOT / "tools" / "installers" / "install_windows.ps1").read_text(encoding="utf-8")
        self.assertIn("Test-LeadBridgePayload", script)
        self.assertIn("Find-LeadBridgePayload", script)
        self.assertIn("leadbridge-kso-tools-windows-v8.2.10.0848.zip", script)
        self.assertIn("Find-PythonCommand", script)
        self.assertIn("Python.Python.3.12", script)
        self.assertIn("-m pip install", script)
        self.assertLess(script.index("if (-not $SourceRoot)"), script.index("New-Item -ItemType Directory -Force -Path $Target"))

    def test_ocr_launcher_self_checks_python_and_tesseract(self):
        launcher = (ROOT / "tools" / "launcher" / "run_ocr_windows.bat").read_text(encoding="utf-8")
        self.assertIn("where py", launcher)
        self.assertIn("Python.Python.3.12", launcher)
        self.assertIn('-c "import PIL"', launcher)
        self.assertIn("where tesseract", launcher)
        self.assertNotIn('\npy "%OCR%"', launcher)

    def test_one_click_setup_embeds_dependencies_and_launches_product(self):
        installer = (ROOT / "tools" / "windows-one-click" / "LeadBridgeKSO.nsi").read_text(encoding="utf-8")
        builder = (ROOT / "tools" / "windows-one-click" / "build_setup.py").read_text(encoding="utf-8")
        self.assertIn("RequestExecutionLevel admin", installer)
        self.assertIn("python-installer.exe", installer)
        self.assertIn("tesseract-installer.exe", installer)
        self.assertIn("pillow.whl", installer)
        self.assertIn("rus.traineddata", installer)
        self.assertIn("CreateShortCut", installer)
        self.assertIn('ExecShell "open"', installer)
        self.assertIn("Python.Python.3.12", (ROOT / "tools" / "installers" / "install_windows.ps1").read_text(encoding="utf-8"))
        self.assertIn("67b5635e80ea51072b87941312d00ec8927c4db9ba18938f7ad2d27b328b95fb", builder)

    def test_wpf_builder_checks_for_dotnet_8(self):
        script = (ROOT / "native" / "windows-wpf" / "build.ps1").read_text(encoding="utf-8")
        self.assertIn("Get-Command dotnet", script)
        self.assertIn("--list-sdks", script)
        self.assertIn("Microsoft.DotNet.SDK.8", script)
        self.assertIn("& $Dotnet publish", script)


class MacOSDistributionTests(unittest.TestCase):
    def test_dmg_builder_creates_universal_macos_12_app(self):
        script = (ROOT / "native" / "macos-dmg" / "build_dmg.sh").read_text(encoding="utf-8")
        self.assertIn('MIN_MACOS_VERSION="12.0"', script)
        self.assertIn('arm64-apple-macosx$MIN_MACOS_VERSION', script)
        self.assertIn('x86_64-apple-macosx$MIN_MACOS_VERSION', script)
        self.assertIn("lipo -create", script)
        self.assertIn("codesign --force --deep --sign -", script)


if __name__ == "__main__":
    unittest.main()
