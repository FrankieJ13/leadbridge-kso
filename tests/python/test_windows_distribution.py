import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class WindowsDistributionTests(unittest.TestCase):
    def test_installer_validates_complete_payload_before_writing_target(self):
        script = (ROOT / "tools" / "installers" / "install_windows.ps1").read_text(encoding="utf-8")
        self.assertIn("Test-LeadBridgePayload", script)
        self.assertIn("Find-LeadBridgePayload", script)
        self.assertIn("leadbridge-kso-tools-windows-v8.2.10.0848.zip", script)
        self.assertLess(script.index("if (-not $SourceRoot)"), script.index("New-Item -ItemType Directory -Force -Path $Target"))

    def test_wpf_builder_checks_for_dotnet_8(self):
        script = (ROOT / "native" / "windows-wpf" / "build.ps1").read_text(encoding="utf-8")
        self.assertIn("Get-Command dotnet", script)
        self.assertIn("--list-sdks", script)
        self.assertIn("Microsoft.DotNet.SDK.8", script)
        self.assertIn("& $Dotnet publish", script)


if __name__ == "__main__":
    unittest.main()
