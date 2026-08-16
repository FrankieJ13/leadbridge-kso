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


if __name__ == "__main__":
    unittest.main()
