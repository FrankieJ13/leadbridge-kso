from __future__ import annotations

import importlib.util
import stat
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "apps" / "max-chat-ocr-postprocessor" / "max_chat_ocr.py"
SPEC = importlib.util.spec_from_file_location("max_chat_ocr", MODULE_PATH)
assert SPEC and SPEC.loader
ocr = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ocr
SPEC.loader.exec_module(ocr)


class OcrSecurityTests(unittest.TestCase):
    def make_zip(self, root: Path, name: str, payload: bytes = b"content") -> Path:
        archive = root / "export.zip"
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(name, payload)
        return archive

    def test_zip_slip_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive = self.make_zip(root, "../../outside.txt")
            with self.assertRaisesRegex(ocr.UnsafeArchiveError, "parent traversal"):
                ocr.safe_extract_zip(archive, root / "extract")
            self.assertFalse((root / "outside.txt").exists())

    def test_absolute_zip_path_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive = self.make_zip(root, "/absolute.txt")
            with self.assertRaisesRegex(ocr.UnsafeArchiveError, "absolute path"):
                ocr.safe_extract_zip(archive, root / "extract")

            windows_archive = self.make_zip(root, "C:\\secret.txt")
            with self.assertRaisesRegex(ocr.UnsafeArchiveError, "absolute path"):
                ocr.safe_extract_zip(windows_archive, root / "extract")

    def test_zip_symlink_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive = root / "export.zip"
            info = zipfile.ZipInfo("attachments/link.jpg")
            info.create_system = 3
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            with zipfile.ZipFile(archive, "w") as zf:
                zf.writestr(info, "../../secret.jpg")
            with self.assertRaisesRegex(ocr.UnsafeArchiveError, "symlink"):
                ocr.safe_extract_zip(archive, root / "extract")

    def test_zip_bomb_limit_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive = self.make_zip(root, "large.txt", b"01234567890")
            with mock.patch.object(ocr, "MAX_ZIP_SINGLE_FILE", 10):
                with self.assertRaisesRegex(ocr.UnsafeArchiveError, "single file too large"):
                    ocr.safe_extract_zip(archive, root / "extract")

    def test_zip_file_count_limit_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive = root / "export.zip"
            with zipfile.ZipFile(archive, "w") as zf:
                zf.writestr("one.txt", b"1")
                zf.writestr("two.txt", b"2")
            with mock.patch.object(ocr, "MAX_ZIP_FILES", 1):
                with self.assertRaisesRegex(ocr.UnsafeArchiveError, "too many files"):
                    ocr.safe_extract_zip(archive, root / "extract")

    def test_zip_total_size_limit_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive = root / "export.zip"
            with zipfile.ZipFile(archive, "w") as zf:
                zf.writestr("one.txt", b"123456")
                zf.writestr("two.txt", b"123456")
            with mock.patch.object(ocr, "MAX_ZIP_TOTAL_UNCOMPRESSED", 10):
                with self.assertRaisesRegex(ocr.UnsafeArchiveError, "archive too large"):
                    ocr.safe_extract_zip(archive, root / "extract")

    def test_zip_compression_ratio_limit_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive = self.make_zip(root, "compressed.txt", b"A" * 4096)
            with mock.patch.object(ocr, "MAX_ZIP_COMPRESSION_RATIO", 2):
                with self.assertRaisesRegex(ocr.UnsafeArchiveError, "compression ratio"):
                    ocr.safe_extract_zip(archive, root / "extract")

    def test_zip_case_insensitive_duplicate_path_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive = root / "export.zip"
            with zipfile.ZipFile(archive, "w") as zf:
                zf.writestr("attachments/Form.jpg", b"one")
                zf.writestr("attachments/form.jpg", b"two")
            with self.assertRaisesRegex(ocr.UnsafeArchiveError, "duplicate path"):
                ocr.safe_extract_zip(archive, root / "extract")

    def test_zip_runtime_copy_limit_rejects_more_bytes_than_declared(self) -> None:
        class FakeInfo:
            filename = "payload.bin"
            external_attr = stat.S_IFREG << 16
            file_size = 5
            compress_size = 5

            @staticmethod
            def is_dir() -> bool:
                return False

        class FakeSource:
            def __init__(self) -> None:
                self.sent = False

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, _size: int) -> bytes:
                if self.sent:
                    return b""
                self.sent = True
                return b"12345678901"

        class FakeZip:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            @staticmethod
            def infolist():
                return [FakeInfo()]

            @staticmethod
            def open(_info, _mode):
                return FakeSource()

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with mock.patch.object(ocr.zipfile, "ZipFile", return_value=FakeZip()), \
                 mock.patch.object(ocr, "MAX_ZIP_SINGLE_FILE", 10):
                with self.assertRaisesRegex(ocr.UnsafeArchiveError, "expanded beyond declared"):
                    ocr.safe_extract_zip(root / "fake.zip", root / "extract")
            self.assertFalse((root / "extract").exists())

    def test_attachment_absolute_path_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            secret = root.parent / "leadbridge-secret.jpg"
            secret.write_bytes(b"secret")
            try:
                with self.assertRaisesRegex(ocr.UnsafeAttachmentPath, "absolute path"):
                    ocr.resolve_attachment(root, str(secret))
            finally:
                secret.unlink(missing_ok=True)

    def test_attachment_parent_traversal_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with self.assertRaisesRegex(ocr.UnsafeAttachmentPath, "parent traversal"):
                ocr.resolve_attachment(root, "..\\..%2fsecret.jpg")

    def test_valid_relative_attachment_allowed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            attachment = root / "attachments" / "msg_0001" / "att_01.jpg"
            attachment.parent.mkdir(parents=True)
            attachment.write_bytes(b"image")
            resolved = ocr.resolve_attachment(root, "attachments/msg_0001/att_01.jpg")
            self.assertEqual(resolved, attachment.resolve())

    def test_attachment_filename_is_not_interpreted_as_glob(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            attachment = root / "attachments" / "safe.jpg"
            attachment.parent.mkdir(parents=True)
            attachment.write_bytes(b"image")
            self.assertIsNone(ocr.resolve_attachment(root, "*.jpg"))

    def test_valid_zip_extracts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive = self.make_zip(root, "MAX_EXPORT/messages.json", b'{"messages": []}')
            stats = ocr.safe_extract_zip(archive, root / "extract")
            self.assertEqual(stats.files, 1)
            self.assertEqual((root / "extract" / "MAX_EXPORT" / "messages.json").read_bytes(), b'{"messages": []}')

    def test_unsafe_attachment_becomes_diagnostic_status(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            result = ocr.ocr_attachment(
                export_root=root,
                rel_path="../../secret.jpg",
                message_index=1,
                attachment_index=1,
                out_dir=root / "out",
                tesseract_cmd="not-used",
                lang="rus+eng",
                psm=6,
                timeout=1,
            )
            self.assertEqual(result.status, "unsafe_path")

    def test_spreadsheet_formula_text_is_neutralized(self) -> None:
        self.assertEqual(ocr.spreadsheet_safe("=HYPERLINK(\"https://evil.test\")"), "'=HYPERLINK(\"https://evil.test\")")
        self.assertEqual(ocr.spreadsheet_safe("-1+2"), "'-1+2")
        self.assertEqual(ocr.spreadsheet_safe(-12), -12)
        self.assertEqual(ocr.spreadsheet_safe("89123456789"), "89123456789")

    def test_form_phone_extraction_ignores_passport_like_numbers(self) -> None:
        text = """Паспорт
8 692 095-10-05
Серия и номер документа
8 951 151-87-74
Мобильный телефон
8 906 950-87-19
Контактное лицо, телефон
8 922 183-70-57
"""
        form = ocr.extract_structured_form(text)
        self.assertEqual(
            form["normalized"]["all_phones_norm"],
            ["79069508719", "79221837057"],
        )


if __name__ == "__main__":
    unittest.main()
