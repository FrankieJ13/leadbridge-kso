from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "tools" / "ocr-bridge" / "ocr_bridge.py"
SPEC = importlib.util.spec_from_file_location("ocr_bridge", MODULE_PATH)
assert SPEC and SPEC.loader
bridge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bridge)


class OcrBridgeTests(unittest.TestCase):
    def test_archive_path_accepts_only_exporter_zip(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            valid = root / "MAX_CHAT_EXPORT_120msg_44att_16-08-26_14-30.zip"
            valid.write_bytes(b"zip")
            self.assertEqual(bridge.validate_archive_path(valid), valid.resolve())

            invalid = root / "private.zip"
            invalid.write_bytes(b"zip")
            with self.assertRaisesRegex(ValueError, "MAX_CHAT_EXPORT"):
                bridge.validate_archive_path(invalid)

    def test_archive_path_rejects_relative_and_oversized_files(self):
        with self.assertRaisesRegex(ValueError, "абсолютный"):
            bridge.validate_archive_path("MAX_CHAT_EXPORT_1msg_0att_16-08-26_14-30.zip")

        with tempfile.TemporaryDirectory() as tmp:
            archive = Path(tmp) / "MAX_CHAT_EXPORT_1msg_0att_16-08-26_14-30.zip"
            archive.write_bytes(b"zip")
            with mock.patch.object(bridge, "MAX_ARCHIVE_BYTES", 2):
                with self.assertRaisesRegex(ValueError, "16 ГБ"):
                    bridge.validate_archive_path(archive)

    def test_ocr_command_uses_local_script_output_and_tesseract(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            script = root / "tools" / "max-chat-ocr-postprocessor" / "max_chat_ocr.py"
            script.parent.mkdir(parents=True)
            script.write_text("print('ok')\n", encoding="utf-8")
            archive = root / "MAX_CHAT_EXPORT_1msg_0att_16-08-26_14-30.zip"
            archive.write_bytes(b"zip")
            tesseract = root / "tesseract"
            tesseract.write_bytes(b"bin")

            with mock.patch.object(bridge.importlib.util, "find_spec", return_value=object()):
                command, output = bridge.build_ocr_command(root, archive, tesseract)

            self.assertEqual(command[0], bridge.sys.executable)
            self.assertIn(str(archive), command)
            self.assertIn(str(tesseract), command)
            self.assertEqual(output, root / "ocr_results")
            self.assertTrue(output.is_dir())

    def test_bridge_security_contract_blocks_web_origins(self):
        self.assertEqual(bridge.BRIDGE_HEADER, "leadbridge-kso-ocr-v1")
        self.assertIsNotNone(bridge.EXTENSION_ORIGIN_RE.fullmatch("chrome-extension://abcdefghijklmnopabcdefghijklmnop"))
        self.assertIsNone(bridge.EXTENSION_ORIGIN_RE.fullmatch("https://web.max.ru"))


if __name__ == "__main__":
    unittest.main()
