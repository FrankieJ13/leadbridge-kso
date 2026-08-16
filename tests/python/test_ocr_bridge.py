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

INSTALLER_PATH = ROOT / "tools" / "ocr-bridge" / "install_bridge.py"
INSTALLER_SPEC = importlib.util.spec_from_file_location("install_ocr_bridge", INSTALLER_PATH)
assert INSTALLER_SPEC and INSTALLER_SPEC.loader
bridge_installer = importlib.util.module_from_spec(INSTALLER_SPEC)
INSTALLER_SPEC.loader.exec_module(bridge_installer)


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

    def test_job_status_reports_failure_from_local_log(self):
        with tempfile.TemporaryDirectory() as tmp:
            log_path = Path(tmp) / "ocr.log"
            log_path.write_text("starting\narchive is broken\n", encoding="utf-8")
            manager = bridge.OcrJobManager(Path(tmp))
            manager.process = mock.Mock()
            manager.process.poll.return_value = 3
            manager.archive = Path(tmp) / "MAX_CHAT_EXPORT_1msg_0att_16-08-26_14-30.zip"
            manager.output_dir = Path(tmp) / "ocr_results"
            manager.log_path = log_path

            status = manager.status()

            self.assertEqual(status["state"], "failed")
            self.assertEqual(status["exitCode"], 3)
            self.assertEqual(status["error"], "archive is broken")

    def test_bridge_security_contract_blocks_web_origins(self):
        self.assertEqual(bridge.BRIDGE_HEADER, "leadbridge-kso-ocr-v1")
        self.assertEqual(bridge.BRIDGE_API_VERSION, 2)
        self.assertIsNotNone(bridge.EXTENSION_ORIGIN_RE.fullmatch("chrome-extension://abcdefghijklmnopabcdefghijklmnop"))
        self.assertIsNone(bridge.EXTENSION_ORIGIN_RE.fullmatch("https://web.max.ru"))

    def test_health_advertises_current_ocr_capabilities(self):
        handler = object.__new__(bridge.OcrBridgeHandler)
        handler.path = "/health"
        handler.manager = mock.Mock()
        handler.manager.process = None
        handler.send_json = mock.Mock()

        handler.do_GET()

        status, payload = handler.send_json.call_args.args
        self.assertEqual(status, 200)
        self.assertEqual(payload["apiVersion"], 2)
        self.assertEqual(payload["capabilities"], ["run", "pick-and-run", "status"])

    def test_status_endpoint_requires_bridge_header(self):
        handler = object.__new__(bridge.OcrBridgeHandler)
        handler.path = "/status"
        handler.headers = {}
        handler.manager = mock.Mock()
        handler.send_json = mock.Mock()

        handler.do_GET()

        handler.send_json.assert_called_once_with(403, {"ok": False, "error": "OCR bridge authorization failed"})
        handler.manager.status.assert_not_called()

    def test_native_picker_dispatches_by_operating_system(self):
        expected = Path("/tmp/MAX_CHAT_EXPORT_1msg_0att_16-08-26_14-30.zip")
        with mock.patch.object(bridge.platform, "system", return_value="Windows"):
            with mock.patch.object(bridge, "choose_archive_windows", return_value=expected) as picker:
                self.assertEqual(bridge.choose_archive(), expected)
                picker.assert_called_once_with()
        with mock.patch.object(bridge.platform, "system", return_value="Darwin"):
            with mock.patch.object(bridge, "choose_archive_macos", return_value=expected) as picker:
                self.assertEqual(bridge.choose_archive(), expected)
                picker.assert_called_once_with()

    def test_cancelled_picker_has_a_distinct_result(self):
        with mock.patch.object(bridge.platform, "system", return_value="Darwin"):
            with mock.patch.object(bridge, "choose_archive_macos", side_effect=bridge.ArchiveSelectionCancelled):
                with self.assertRaises(bridge.ArchiveSelectionCancelled):
                    bridge.choose_archive()

    def test_pick_endpoint_reports_cancel_without_starting_ocr(self):
        manager = mock.Mock()
        handler = object.__new__(bridge.OcrBridgeHandler)
        handler.manager = manager
        handler.path = "/pick-and-run"
        handler.headers = {"X-LeadBridge-Bridge": bridge.BRIDGE_HEADER}
        handler.send_json = mock.Mock()

        with mock.patch.object(bridge, "choose_archive", side_effect=bridge.ArchiveSelectionCancelled):
            handler.do_POST()

        handler.send_json.assert_called_once_with(200, {"ok": True, "cancelled": True})
        manager.launch.assert_not_called()

    def test_installer_restarts_an_existing_bridge_after_update(self):
        with mock.patch.object(bridge_installer, "is_ready", side_effect=[True, True, False]):
            with mock.patch.object(bridge_installer, "request_shutdown") as shutdown:
                with mock.patch.object(bridge_installer.time, "sleep"):
                    self.assertTrue(bridge_installer.stop_running_bridge())
        shutdown.assert_called_once_with()

    def test_installer_does_not_stop_when_bridge_is_absent(self):
        with mock.patch.object(bridge_installer, "is_ready", return_value=False):
            with mock.patch.object(bridge_installer, "request_shutdown") as shutdown:
                self.assertTrue(bridge_installer.stop_running_bridge())
        shutdown.assert_not_called()


if __name__ == "__main__":
    unittest.main()
