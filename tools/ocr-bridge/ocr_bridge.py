#!/usr/bin/env python3
"""Loopback-only bridge that starts LeadBridge OCR for a downloaded MAX archive."""

from __future__ import annotations

import importlib.util
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import threading
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


HOST = "127.0.0.1"
PORT = 17848
BRIDGE_HEADER = "leadbridge-kso-ocr-v1"
MAX_REQUEST_BYTES = 64 * 1024
MAX_ARCHIVE_BYTES = 16 * 1024 * 1024 * 1024
ARCHIVE_RE = re.compile(
    r"^MAX_CHAT_EXPORT_\d+msg_\d+att_\d{2}-\d{2}-\d{2}_\d{2}-\d{2}(?: \(\d+\))?\.zip$"
)
EXTENSION_ORIGIN_RE = re.compile(r"^chrome-extension://[a-p]{32}$")


class ArchiveSelectionCancelled(Exception):
    """Raised when the user closes the native archive picker."""


def installation_root(script_path: Path | None = None) -> Path:
    script = (script_path or Path(__file__)).resolve()
    return script.parents[2]


def validate_archive_path(value: object) -> Path:
    raw = str(value or "").strip()
    candidate = Path(raw).expanduser()
    if not candidate.is_absolute():
        raise ValueError("OCR-архив должен иметь абсолютный путь")
    if not ARCHIVE_RE.fullmatch(candidate.name):
        raise ValueError("Разрешены только архивы MAX_CHAT_EXPORT_...zip")
    try:
        resolved = candidate.resolve(strict=True)
    except FileNotFoundError as error:
        raise ValueError("OCR-архив не найден") from error
    if not resolved.is_file() or not ARCHIVE_RE.fullmatch(resolved.name):
        raise ValueError("OCR-архив не найден")
    if resolved.stat().st_size > MAX_ARCHIVE_BYTES:
        raise ValueError("OCR-архив превышает лимит 16 ГБ")
    return resolved


def choose_archive_windows() -> Path:
    powershell = shutil.which("powershell.exe") or shutil.which("powershell")
    if not powershell:
        raise RuntimeError("Системное окно выбора файла недоступно: PowerShell не найден")
    script = r"""
Add-Type -AssemblyName System.Windows.Forms
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = 'Выберите архив MAX для OCR'
$dialog.Filter = 'Архивы MAX (MAX_CHAT_EXPORT_*.zip)|MAX_CHAT_EXPORT_*.zip|ZIP-архивы (*.zip)|*.zip'
$dialog.CheckFileExists = $true
$dialog.Multiselect = $false
$dialog.RestoreDirectory = $true
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::WriteLine($dialog.FileName)
  exit 0
}
exit 3
"""
    result = subprocess.run(
        [powershell, "-NoProfile", "-STA", "-Command", script],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        check=False,
    )
    if result.returncode == 3:
        raise ArchiveSelectionCancelled
    selected = result.stdout.strip()
    if result.returncode != 0 or not selected:
        details = result.stderr.strip() or "неизвестная ошибка"
        raise RuntimeError(f"Не удалось открыть окно выбора ZIP: {details}")
    return Path(selected)


def choose_archive_macos() -> Path:
    script = (
        'set selectedFile to choose file with prompt "Выберите архив MAX для OCR" '
        'of type {"public.zip-archive"}\nPOSIX path of selectedFile'
    )
    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        if "-128" in result.stderr or "canceled" in result.stderr.lower():
            raise ArchiveSelectionCancelled
        raise RuntimeError(f"Не удалось открыть окно выбора ZIP: {result.stderr.strip() or 'неизвестная ошибка'}")
    selected = result.stdout.strip()
    if not selected:
        raise ArchiveSelectionCancelled
    return Path(selected)


def choose_archive_fallback() -> Path:
    try:
        import tkinter as tk
        from tkinter import filedialog
    except ImportError as error:
        raise RuntimeError("Системное окно выбора файла недоступно") from error

    root = tk.Tk()
    root.withdraw()
    try:
        root.attributes("-topmost", True)
        selected = filedialog.askopenfilename(
            title="Выберите архив MAX для OCR",
            filetypes=(("Архивы MAX", "MAX_CHAT_EXPORT_*.zip"), ("ZIP-архивы", "*.zip")),
        )
    finally:
        root.destroy()
    if not selected:
        raise ArchiveSelectionCancelled
    return Path(selected)


def choose_archive() -> Path:
    system = platform.system().lower()
    if system == "windows":
        return choose_archive_windows()
    if system == "darwin":
        return choose_archive_macos()
    return choose_archive_fallback()


def discover_tesseract() -> Path:
    candidates = [
        os.environ.get("LEADBRIDGE_TESSERACT", ""),
        shutil.which("tesseract") or "",
        r"C:\LeadBridgeKSO\runtime\tesseract\tesseract.exe",
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        "/opt/homebrew/bin/tesseract",
        "/usr/local/bin/tesseract",
        "/usr/bin/tesseract",
    ]
    for value in candidates:
        if value and Path(value).is_file():
            return Path(value).resolve()
    raise RuntimeError("Tesseract не найден. Повтори установку пакета LeadBridge KSO")


def build_ocr_command(root: Path, archive: Path, tesseract: Path) -> tuple[list[str], Path]:
    ocr_script = root / "tools" / "max-chat-ocr-postprocessor" / "max_chat_ocr.py"
    if not ocr_script.is_file():
        raise RuntimeError(f"OCR-компонент не найден: {ocr_script}")
    if importlib.util.find_spec("PIL") is None:
        raise RuntimeError("Python-модуль Pillow не установлен. Повтори установку пакета LeadBridge KSO")
    output_dir = root / "ocr_results"
    output_dir.mkdir(parents=True, exist_ok=True)
    return [
        sys.executable,
        str(ocr_script),
        str(archive),
        "--output",
        str(output_dir),
        "--tesseract",
        str(tesseract),
    ], output_dir


class OcrJobManager:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.lock = threading.Lock()
        self.process: subprocess.Popen[bytes] | None = None

    def launch(self, archive: Path) -> dict[str, Any]:
        with self.lock:
            if self.process and self.process.poll() is None:
                raise RuntimeError("OCR уже выполняется. Дождись завершения текущей обработки")

            command, output_dir = build_ocr_command(self.root, archive, discover_tesseract())
            log_dir = self.root / "logs"
            log_dir.mkdir(parents=True, exist_ok=True)
            stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            log_path = log_dir / f"ocr_{stamp}.log"
            creationflags = 0
            if os.name == "nt":
                creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)

            with log_path.open("ab") as log_file:
                self.process = subprocess.Popen(
                    command,
                    cwd=str(Path(command[1]).parent),
                    stdin=subprocess.DEVNULL,
                    stdout=log_file,
                    stderr=subprocess.STDOUT,
                    creationflags=creationflags,
                    start_new_session=os.name != "nt",
                    close_fds=True,
                )

            return {
                "ok": True,
                "pid": self.process.pid,
                "archive": archive.name,
                "outputDir": str(output_dir),
                "logFile": str(log_path),
            }


class OcrBridgeHandler(BaseHTTPRequestHandler):
    manager: OcrJobManager
    server_version = "LeadBridgeOCRBridge/1.0"

    def log_message(self, _format: str, *_args: object) -> None:
        return

    def extension_origin(self) -> str:
        origin = self.headers.get("Origin", "").strip()
        return origin if EXTENSION_ORIGIN_RE.fullmatch(origin) else ""

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        origin = self.extension_origin()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:  # noqa: N802
        if self.path != "/health":
            self.send_json(404, {"ok": False, "error": "not found"})
            return
        active = bool(self.manager.process and self.manager.process.poll() is None)
        self.send_json(200, {"ok": True, "service": "LeadBridge OCR Bridge", "active": active})

    def do_OPTIONS(self) -> None:  # noqa: N802
        origin = self.extension_origin()
        if not origin:
            self.send_json(403, {"ok": False, "error": "extension origin required"})
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-LeadBridge-Bridge")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self) -> None:  # noqa: N802
        if self.path not in {"/run", "/pick-and-run", "/shutdown"}:
            self.send_json(404, {"ok": False, "error": "not found"})
            return
        if self.headers.get("X-LeadBridge-Bridge") != BRIDGE_HEADER:
            self.send_json(403, {"ok": False, "error": "OCR bridge authorization failed"})
            return
        origin = self.headers.get("Origin", "").strip()
        if origin and not self.extension_origin():
            self.send_json(403, {"ok": False, "error": "web pages cannot start OCR"})
            return
        if self.path == "/shutdown":
            self.send_json(200, {"ok": True})
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        if self.path == "/pick-and-run":
            try:
                archive = validate_archive_path(choose_archive())
                self.send_json(202, self.manager.launch(archive))
            except ArchiveSelectionCancelled:
                self.send_json(200, {"ok": True, "cancelled": True})
            except (OSError, ValueError, RuntimeError) as error:
                self.send_json(400, {"ok": False, "error": str(error)})
            return
        if not self.headers.get("Content-Type", "").lower().startswith("application/json"):
            self.send_json(415, {"ok": False, "error": "application/json required"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_REQUEST_BYTES:
            self.send_json(413, {"ok": False, "error": "invalid request size"})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            archive = validate_archive_path(payload.get("path"))
            self.send_json(202, self.manager.launch(archive))
        except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as error:
            self.send_json(400, {"ok": False, "error": str(error)})


def main() -> int:
    root = installation_root()
    OcrBridgeHandler.manager = OcrJobManager(root)
    try:
        server = ThreadingHTTPServer((HOST, PORT), OcrBridgeHandler)
    except OSError as error:
        print(f"LeadBridge OCR Bridge could not start: {error}", file=sys.stderr)
        return 2
    server.serve_forever(poll_interval=0.5)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
