#!/usr/bin/env python3
"""Build the offline one-click Windows installer with pinned dependencies."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import struct
import subprocess
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "dist" / "windows-installer"
VENDOR = WORK / "vendor"
STAGE = WORK / "stage"
ICON = WORK / "LeadBridgeKSO.ico"
OUTPUT = ROOT / "releases" / "packages" / "LeadBridgeKSO-Setup-Windows-v8.2.10.0848.exe"
VERSION = "v8.2.10.0848"

DEPENDENCIES = {
    "python-3.12.10-amd64.exe": {
        "url": "https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe",
        "sha256": "67b5635e80ea51072b87941312d00ec8927c4db9ba18938f7ad2d27b328b95fb",
    },
    "tesseract-ocr-w64-setup-5.5.3.20260724.exe": {
        "url": "https://github.com/tesseract-ocr/tesseract/releases/download/5.5.3/tesseract-ocr-w64-setup-5.5.3.20260724.exe",
        "sha256": "bee9e3434bd94fd65387d9be28cd467a41f61b1275383b55b0f59a1331270ae4",
    },
    "pillow-12.3.0-cp312-cp312-win_amd64.whl": {
        "url": "https://files.pythonhosted.org/packages/45/89/da2f7971a317f83d807fdd4065c0af40208e59e692cc43d315a71a0e96d1/pillow-12.3.0-cp312-cp312-win_amd64.whl",
        "sha256": "a2b55dd6b2a4c4b7d87ffa56bdb33fdc5fdb9a462173861a7bc097f17d91cb09",
    },
    "rus.traineddata": {
        "url": "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd/rus.traineddata",
        "sha256": "e16e5e036cce1d9ec2b00063cf8b54472625b9e14d893a169e2b0dedeb4df225",
    },
    "eng.traineddata": {
        "url": "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd/eng.traineddata",
        "sha256": "7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2",
    },
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_dependencies(download: bool) -> None:
    VENDOR.mkdir(parents=True, exist_ok=True)
    for filename, metadata in DEPENDENCIES.items():
        target = VENDOR / filename
        if target.is_file() and sha256(target) == metadata["sha256"]:
            continue
        if not download:
            raise RuntimeError(f"missing or invalid vendor file: {target}; rerun with --download")
        partial = target.with_suffix(target.suffix + ".part")
        partial.unlink(missing_ok=True)
        print(f"Downloading {filename}...")
        urllib.request.urlretrieve(metadata["url"], partial)
        if sha256(partial) != metadata["sha256"]:
            partial.unlink(missing_ok=True)
            raise RuntimeError(f"SHA-256 mismatch: {filename}")
        partial.replace(target)


def copytree(source: Path, target: Path) -> None:
    shutil.copytree(source, target, ignore=shutil.ignore_patterns(".DS_Store", "__pycache__", "*.pyc"))


def git_commit() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def prepare_stage() -> None:
    if STAGE.exists():
        shutil.rmtree(STAGE)
    STAGE.mkdir(parents=True)

    copytree(ROOT / "apps" / "leadbridge-web", STAGE / "tools" / "leadbridge")
    shutil.rmtree(STAGE / "tools" / "leadbridge" / "releases", ignore_errors=True)
    copytree(ROOT / "apps" / "max-chat-local-exporter", STAGE / "tools" / "max-chat-local-exporter")
    copytree(ROOT / "apps" / "max-chat-ocr-postprocessor", STAGE / "tools" / "max-chat-ocr-postprocessor")
    copytree(ROOT / "integrations" / "google-apps-script-amocrm", STAGE / "integrations" / "google-apps-script-amocrm")

    (STAGE / "launchers").mkdir(parents=True)
    shutil.copy2(ROOT / "tools" / "launcher" / "open_leadbridge_windows.bat", STAGE / "launchers" / "open_leadbridge.bat")
    shutil.copy2(ROOT / "tools" / "launcher" / "run_ocr_windows.bat", STAGE / "launchers" / "run_ocr_windows.bat")
    shutil.copy2(ROOT / "tools" / "templates" / "README_FIRST_windows.txt", STAGE / "README_FIRST.txt")
    shutil.copy2(Path(__file__).with_name("THIRD_PARTY_NOTICES.txt"), STAGE / "THIRD_PARTY_NOTICES.txt")
    (STAGE / "exports").mkdir()
    (STAGE / "ocr_results").mkdir()
    (STAGE / "BUILD_INFO.json").write_text(
        json.dumps({"version": VERSION, "git_commit": git_commit(), "installer": "one-click-offline"}, indent=2) + "\n",
        encoding="utf-8",
    )

    png = (ROOT / "apps" / "leadbridge-web" / "icons" / "icon-192.png").read_bytes()
    ico_header = struct.pack("<HHH", 0, 1, 1)
    ico_entry = struct.pack("<BBBBHHII", 192, 192, 0, 0, 1, 32, len(png), 22)
    ICON.write_bytes(ico_header + ico_entry + png)
    shutil.copy2(ICON, STAGE / "LeadBridgeKSO.ico")


def build(download: bool) -> None:
    ensure_dependencies(download)
    prepare_stage()
    makensis = shutil.which("makensis")
    if not makensis:
        raise RuntimeError("makensis was not found; install NSIS 3")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.unlink(missing_ok=True)
    subprocess.run(
        [
            makensis,
            f"-DSTAGE={STAGE}",
            f"-DVENDOR={VENDOR}",
            f"-DOUTPUT={OUTPUT}",
            f"-DICON={ICON}",
            str(Path(__file__).with_name("LeadBridgeKSO.nsi")),
        ],
        cwd=ROOT,
        check=True,
    )
    if OUTPUT.read_bytes()[:2] != b"MZ":
        raise RuntimeError("NSIS output is not a Windows executable")
    print(f"Built: {OUTPUT.relative_to(ROOT)}")
    print(f"Size: {OUTPUT.stat().st_size} bytes")
    print(f"SHA-256: {sha256(OUTPUT)}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--download", action="store_true", help="Download missing pinned vendor dependencies")
    args = parser.parse_args()
    build(args.download)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
