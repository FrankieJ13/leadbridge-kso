from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "tools" / "build_release_packages.py"
SPEC = importlib.util.spec_from_file_location("build_release_packages", MODULE_PATH)
assert SPEC and SPEC.loader
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


class ReleaseIntegrityTests(unittest.TestCase):
    def test_exporter_bundle_embeds_current_local_leadbridge(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "exporter"
            with mock.patch.object(release, "git_untracked_files", return_value=set()):
                release.copy_exporter_bundle(target)

            local_index = (target / "leadbridge" / "index.html").read_text(encoding="utf-8")
            self.assertIn('../leadbridge_handoff_client.js', local_index)
            self.assertTrue((target / "leadbridge" / "app.js").is_file())
            self.assertTrue((target / "leadbridge" / "src" / "security.js").is_file())
            self.assertTrue((target / "handoff_host.html").is_file())

    def test_component_zip_excludes_local_chat_exports(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "component"
            source.mkdir()
            (source / "tool.py").write_text("print('ok')\n", encoding="utf-8")
            (source / "MAX_CHAT_EXPORT_private.zip").write_bytes(b"private")
            output = root / "component.zip"

            release.zip_path(source, output, exclude_patterns=("MAX_CHAT_EXPORT_*.zip",))

            with zipfile.ZipFile(output) as archive:
                self.assertEqual(archive.namelist(), ["tool.py"])

    def test_component_zip_excludes_untracked_local_notes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "component"
            source.mkdir()
            tracked = source / "tool.py"
            tracked.write_text("print('ok')\n", encoding="utf-8")
            local_note = source / "private local note.txt"
            local_note.write_text("do not publish\n", encoding="utf-8")
            output = root / "component.zip"

            with mock.patch.object(release, "git_untracked_files", return_value={local_note.resolve()}):
                release.zip_path(source, output, exclude_untracked=True)

            with zipfile.ZipFile(output) as archive:
                self.assertEqual(archive.namelist(), ["tool.py"])

    def test_verify_rejects_unlisted_package_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            packages = root / "packages"
            packages.mkdir()
            expected = packages / "expected.zip"
            expected.write_bytes(b"expected")
            orphan = packages / "orphan.zip"
            orphan.write_bytes(b"orphan")
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps({
                "artifacts": {
                    expected.name: {
                        "sha256": release.sha256(expected),
                        "size_bytes": expected.stat().st_size,
                    }
                }
            }), encoding="utf-8")
            sums = root / "SHA256SUMS"
            sums.write_text(f"{release.sha256(expected)}  {expected.name}\n", encoding="utf-8")

            with mock.patch.object(release, "PACKAGES", packages), \
                 mock.patch.object(release, "MANIFEST", manifest), \
                 mock.patch.object(release, "SHA256SUMS", sums):
                with self.assertRaisesRegex(RuntimeError, "unlisted package artifacts: orphan.zip"):
                    release.verify_integrity()

    def test_cleanup_preserves_current_dmg_and_local_exe(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            packages = Path(tmp)
            current_dmg = packages / f"LeadBridgeKSO-macOS-DMG-{release.PACKAGE_VERSION}.dmg"
            old_dmg = packages / "LeadBridgeKSO-macOS-DMG-v1.dmg"
            old_zip = packages / "old.zip"
            local_exe = packages / "LeadBridgeKSO-Setup-Windows-local.exe"
            for path in (current_dmg, old_dmg, old_zip, local_exe):
                path.write_bytes(b"artifact")

            with mock.patch.object(release, "PACKAGES", packages):
                release.clean_package_artifacts()

            self.assertTrue(current_dmg.exists())
            self.assertTrue(local_exe.exists())
            self.assertFalse(old_dmg.exists())
            self.assertFalse(old_zip.exists())

    def test_download_urls_are_cache_busted_by_build_commit(self) -> None:
        downloads = {
            "tools": {"windows": {"download_url": "releases/packages/windows.zip"}},
            "full_project": {"download_url": "releases/packages/full.zip"},
        }

        release.add_download_cache_bust(downloads, "1234567890abcdef")

        self.assertEqual(
            downloads["tools"]["windows"]["download_url"],
            "releases/packages/windows.zip?build=1234567890ab",
        )
        self.assertEqual(
            downloads["full_project"]["download_url"],
            "releases/packages/full.zip?build=1234567890ab",
        )

    def test_component_manifest_uses_exporter_version(self) -> None:
        filenames = [
            f"leadbridge-kso-tools-macos-{release.PACKAGE_VERSION}.zip",
            f"leadbridge-kso-tools-windows-{release.PACKAGE_VERSION}.zip",
            f"leadbridge-offline-html-{release.APP_VERSION}.zip",
            f"max-chat-local-exporter-{release.EXPORTER_VERSION}.zip",
            f"max-chat-ocr-postprocessor-{release.OCR_VERSION}.zip",
            f"leadbridge-kso-native-windows-wpf-build-{release.PACKAGE_VERSION}.zip",
            f"leadbridge-kso-native-macos-dmg-build-{release.PACKAGE_VERSION}.zip",
        ]
        with tempfile.TemporaryDirectory() as tmp:
            outputs = []
            for filename in filenames:
                path = Path(tmp) / filename
                path.write_bytes(filename.encode("utf-8"))
                outputs.append(path)

            manifest = release.build_manifest(outputs, "1234567890abcdef")

        exporter = manifest["downloads"]["components"]["max_chat_local_exporter"]
        self.assertEqual(exporter["version"], release.EXPORTER_VERSION)


if __name__ == "__main__":
    unittest.main()
