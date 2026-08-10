#!/usr/bin/env python3
"""Build deterministic LeadBridge KSO packages and release integrity metadata."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import stat
import subprocess
import sys
import zipfile
from pathlib import Path


APP_VERSION = "v8.2.10.0848"
PACKAGE_VERSION = APP_VERSION
EXPORTER_VERSION = APP_VERSION
OCR_VERSION = APP_VERSION
SCHEMA_VERSION = 2
ZIP_TIMESTAMP = (2020, 1, 1, 0, 0, 0)

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
BUILD = DIST / "release-build"
PACKAGES = ROOT / "releases" / "packages"
MANIFEST = ROOT / "releases" / "manifest.json"
SHA256SUMS = ROOT / "releases" / "SHA256SUMS"
WEB = ROOT / "apps" / "leadbridge-web"


def git_commit() -> str:
    env_commit = os.environ.get("GITHUB_SHA", "").strip()
    if env_commit:
        return env_commit
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True, stderr=subprocess.DEVNULL
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def reset_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True)


def copytree(src: Path, dst: Path, *extra_ignores: str) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    ignore = shutil.ignore_patterns("__pycache__", ".DS_Store", "*.pyc", *extra_ignores)
    shutil.copytree(src, dst, ignore=ignore)


def copy_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def ensure_executable(path: Path) -> None:
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def zip_info(name: str, executable: bool = False) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(name.replace(os.sep, "/"), ZIP_TIMESTAMP)
    info.create_system = 3
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = ((0o755 if executable else 0o644) & 0xFFFF) << 16
    return info


def zip_path(src: Path, dst: Path, arc_root: str | None = None) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        dst.unlink()
    with zipfile.ZipFile(dst, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        if src.is_file():
            executable = bool(src.stat().st_mode & stat.S_IXUSR)
            zf.writestr(zip_info(arc_root or src.name, executable), src.read_bytes())
            return
        base = src.parent if arc_root else src
        for path in sorted(item for item in src.rglob("*") if item.is_file()):
            if path.name == ".DS_Store" or "__pycache__" in path.parts:
                continue
            arcname = str(path.relative_to(base))
            executable = bool(path.stat().st_mode & stat.S_IXUSR)
            zf.writestr(zip_info(arcname, executable), path.read_bytes())


def copy_web_bundle(target: Path, *, include_pwa: bool = True) -> None:
    reset_dir(target)
    for name in ("index.html", "app.css", "app.js"):
        copy_file(WEB / name, target / name)
    for name in ("src", "icons"):
        copytree(WEB / name, target / name)
    if include_pwa:
        for name in ("manifest.webmanifest", "service-worker.js"):
            copy_file(WEB / name, target / name)


def build_component_zips() -> list[Path]:
    outputs = []
    exporter_zip = PACKAGES / f"max-chat-local-exporter-{EXPORTER_VERSION}.zip"
    zip_path(ROOT / "apps" / "max-chat-local-exporter", exporter_zip)
    outputs.append(exporter_zip)

    ocr_zip = PACKAGES / f"max-chat-ocr-postprocessor-{OCR_VERSION}.zip"
    zip_path(ROOT / "apps" / "max-chat-ocr-postprocessor", ocr_zip)
    outputs.append(ocr_zip)

    html_build = BUILD / f"leadbridge-offline-html-{APP_VERSION}"
    copy_web_bundle(html_build, include_pwa=True)
    copy_file(WEB / "README.md", html_build / "README.md")
    copy_file(WEB / "index.html", html_build / "offline_phone_matcher.html")
    html_zip = PACKAGES / f"leadbridge-offline-html-{APP_VERSION}.zip"
    zip_path(html_build, html_zip)
    outputs.append(html_zip)
    return outputs


def write_build_info(target: Path, commit: str) -> None:
    target.write_text(
        json.dumps(
            {
                "app_version": APP_VERSION,
                "package_version": PACKAGE_VERSION,
                "schema_version": SCHEMA_VERSION,
                "git_commit": commit,
            },
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )


def build_tools_pack(platform_name: str, component_zips: list[Path], commit: str) -> Path:
    is_macos = platform_name == "macos"
    folder_name = f"LeadBridgeKSO-{'macOS' if is_macos else 'Windows'}-{PACKAGE_VERSION}"
    pack = BUILD / folder_name
    reset_dir(pack)
    copy_web_bundle(pack / "tools" / "leadbridge")
    copytree(ROOT / "apps" / "max-chat-local-exporter", pack / "tools" / "max-chat-local-exporter")
    copytree(ROOT / "apps" / "max-chat-ocr-postprocessor", pack / "tools" / "max-chat-ocr-postprocessor")
    copytree(ROOT / "integrations" / "google-apps-script-amocrm", pack / "integrations" / "google-apps-script-amocrm")
    for archive in component_zips:
        copy_file(archive, pack / "archives" / archive.name)
    write_build_info(pack / "BUILD_INFO.json", commit)
    copy_file(
        ROOT / "tools" / "templates" / ("README_FIRST_macos.txt" if is_macos else "README_FIRST_windows.txt"),
        pack / "README_FIRST.txt",
    )
    (pack / "exports").mkdir(parents=True, exist_ok=True)
    (pack / "exports" / ".keep").touch()
    (pack / "ocr_results").mkdir(parents=True, exist_ok=True)
    (pack / "ocr_results" / ".keep").touch()
    (pack / "launchers").mkdir(parents=True, exist_ok=True)

    if is_macos:
        copy_file(ROOT / "tools" / "installers" / "install_macos.command", pack / "install_macos.command")
        copy_file(ROOT / "tools" / "launcher" / "open_leadbridge.command", pack / "launchers" / "open_leadbridge.command")
        copy_file(ROOT / "tools" / "launcher" / "run_ocr_macos.command", pack / "launchers" / "run_ocr_macos.command")
        ensure_executable(pack / "install_macos.command")
        ensure_executable(pack / "launchers" / "open_leadbridge.command")
        ensure_executable(pack / "launchers" / "run_ocr_macos.command")
        output = PACKAGES / f"leadbridge-kso-tools-macos-{PACKAGE_VERSION}.zip"
    else:
        copy_file(ROOT / "tools" / "installers" / "install_windows.ps1", pack / "install_windows.ps1")
        copy_file(ROOT / "tools" / "launcher" / "open_leadbridge_windows.bat", pack / "launchers" / "open_leadbridge.bat")
        copy_file(ROOT / "tools" / "launcher" / "run_ocr_windows.bat", pack / "launchers" / "run_ocr_windows.bat")
        output = PACKAGES / f"leadbridge-kso-tools-windows-{PACKAGE_VERSION}.zip"
    zip_path(pack, output, arc_root=folder_name)
    return output


def build_native_source_zip(kind: str, commit: str) -> Path:
    if kind == "windows-wpf":
        package = BUILD / f"leadbridge-kso-native-windows-wpf-build-{PACKAGE_VERSION}"
        reset_dir(package)
        shutil.copytree(
            ROOT / "native" / "windows-wpf", package, dirs_exist_ok=True,
            ignore=shutil.ignore_patterns("bin", "obj", "dist", "Web", ".DS_Store"),
        )
        copy_web_bundle(package / "LeadBridgeKSO.Windows" / "Web")
        output = PACKAGES / f"leadbridge-kso-native-windows-wpf-build-{PACKAGE_VERSION}.zip"
    elif kind == "macos-dmg":
        package = BUILD / f"leadbridge-kso-native-macos-dmg-build-{PACKAGE_VERSION}"
        reset_dir(package)
        shutil.copytree(
            ROOT / "native" / "macos-dmg", package, dirs_exist_ok=True,
            ignore=shutil.ignore_patterns("build", "dist", "Web", ".DS_Store"),
        )
        copy_web_bundle(package / "Web")
        ensure_executable(package / "build_dmg.sh")
        output = PACKAGES / f"leadbridge-kso-native-macos-dmg-build-{PACKAGE_VERSION}.zip"
    else:
        raise ValueError(f"Unknown native source package kind: {kind}")
    write_build_info(package / "BUILD_INFO.json", commit)
    zip_path(package, output)
    return output


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def artifact_metadata(outputs: list[Path]) -> dict[str, dict[str, object]]:
    return {
        path.name: {"sha256": sha256(path), "size_bytes": path.stat().st_size}
        for path in sorted(outputs, key=lambda item: item.name)
    }


def download_entry(label: str, filename: str, installer: str | None = None) -> dict[str, object]:
    entry: dict[str, object] = {
        "label": label,
        "version": APP_VERSION,
        "file": filename,
        "github_release_asset": filename,
        "download_url": f"releases/packages/{filename}",
    }
    if installer:
        entry["installer"] = installer
    return entry


def build_manifest(outputs: list[Path], commit: str) -> dict[str, object]:
    artifacts = artifact_metadata(outputs)

    def with_integrity(entry: dict[str, object]) -> dict[str, object]:
        entry.update(artifacts[str(entry["file"])])
        return entry

    mac_tools = f"leadbridge-kso-tools-macos-{PACKAGE_VERSION}.zip"
    win_tools = f"leadbridge-kso-tools-windows-{PACKAGE_VERSION}.zip"
    offline = f"leadbridge-offline-html-{APP_VERSION}.zip"
    exporter = f"max-chat-local-exporter-{EXPORTER_VERSION}.zip"
    ocr = f"max-chat-ocr-postprocessor-{OCR_VERSION}.zip"
    win_native = f"leadbridge-kso-native-windows-wpf-build-{PACKAGE_VERSION}.zip"
    mac_native = f"leadbridge-kso-native-macos-dmg-build-{PACKAGE_VERSION}.zip"
    win_setup_app = f"LeadBridgeKSO-Setup-Windows-{PACKAGE_VERSION}.exe"
    mac_dmg_app = f"LeadBridgeKSO-macOS-DMG-{PACKAGE_VERSION}.dmg"
    full_project = f"leadbridge-kso-full-project-{PACKAGE_VERSION}.zip"
    downloads = {
        "tools": {
            "macos": with_integrity(download_entry("LeadBridge KSO tools for macOS", mac_tools, "install_macos.command")),
            "windows": with_integrity(download_entry("LeadBridge KSO tools for Windows", win_tools, "install_windows.ps1")),
        },
        "components": {
            "leadbridge_offline_html": with_integrity(download_entry("LeadBridge offline Web", offline)),
            "max_chat_local_exporter": with_integrity(download_entry("MAX Chat Local Exporter", exporter)),
            "max_chat_ocr_postprocessor": with_integrity(download_entry("MAX Chat OCR Postprocessor", ocr)),
        },
        "native_builds": {
            "windows_wpf": with_integrity(download_entry("LeadBridge KSO native Windows WPF build package", win_native)),
            "macos_dmg": with_integrity(download_entry("LeadBridge KSO native macOS DMG build package", mac_native)),
        },
    }
    native_apps = {}
    if win_setup_app in artifacts:
        native_apps["windows_setup"] = with_integrity(
            download_entry("LeadBridge KSO — автономный установщик Windows", win_setup_app)
        )
    if mac_dmg_app in artifacts:
        native_apps["macos_dmg"] = with_integrity(
            download_entry("LeadBridge KSO — готовое приложение macOS DMG", mac_dmg_app)
        )
    if native_apps:
        downloads["native_apps"] = native_apps
    if full_project in artifacts:
        downloads["full_project"] = with_integrity(download_entry("LeadBridge KSO — полный проект", full_project))
    return {
        "app_version": APP_VERSION,
        "package_version": PACKAGE_VERSION,
        "build_version": PACKAGE_VERSION,
        "schema_version": SCHEMA_VERSION,
        "git_commit": commit,
        "pages_entry": "index.html",
        "release_tag": APP_VERSION,
        "local_data_policy": "MAX/OCR/ZIP files and all matching are local. Optional amoCRM online mode downloads a read-only CSV snapshot from the operator's token-protected Apps Script endpoint. GitHub receives no user data.",
        "local_data_policy_ru": "MAX/OCR/ZIP и весь матчинг остаются локальными. Опциональный онлайн-режим amoCRM скачивает read-only CSV-снимок с защищённого токеном Apps Script оператора. Пользовательские данные не отправляются в GitHub.",
        "downloads": downloads,
        "artifacts": artifacts,
    }


def write_integrity_metadata(outputs: list[Path], commit: str) -> None:
    manifest = build_manifest(outputs, commit)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    SHA256SUMS.write_text(
        "".join(f"{metadata['sha256']}  {filename}\n" for filename, metadata in manifest["artifacts"].items()),
        encoding="utf-8",
    )
    (WEB / "releases").mkdir(parents=True, exist_ok=True)
    shutil.copy2(MANIFEST, WEB / "releases" / "manifest.json")


def verify_integrity() -> None:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    artifacts = data.get("artifacts", {})
    if not artifacts:
        raise RuntimeError("release manifest has no artifacts")
    expected_lines = []
    for filename, metadata in sorted(artifacts.items()):
        path = PACKAGES / filename
        if not path.is_file():
            raise RuntimeError(f"manifest artifact is missing: {filename}")
        actual_hash = sha256(path)
        actual_size = path.stat().st_size
        if metadata.get("sha256") != actual_hash or metadata.get("size_bytes") != actual_size:
            raise RuntimeError(f"integrity metadata mismatch: {filename}")
        expected_lines.append(f"{actual_hash}  {filename}\n")
    if SHA256SUMS.read_text(encoding="utf-8") != "".join(expected_lines):
        raise RuntimeError("SHA256SUMS does not match release artifacts")


def copy_repo_for_github_ready(target: Path) -> None:
    reset_dir(target)
    for item in ROOT.iterdir():
        if item.name in {".git", "dist"}:
            continue
        target_item = target / item.name
        if item.is_dir():
            ignore_names = [".DS_Store", "__pycache__", "*.pyc", "build", "dist", "bin", "obj"]
            if item.name == "releases":
                ignore_names.append("packages")
            shutil.copytree(item, target_item, symlinks=True, ignore=shutil.ignore_patterns(*ignore_names))
        else:
            shutil.copy2(item, target_item)


def build_full_project_zip(outputs: list[Path], commit: str) -> Path:
    ready_root = BUILD / "leadbridge-kso"
    copy_repo_for_github_ready(ready_root)
    copy_file(WEB / "offline_phone_matcher.html", ready_root / "offline_phone_matcher.html")
    copy_file(ROOT / "tools" / "templates" / "README_FULL_PROJECT.txt", ready_root / "README_LOCAL_FIRST.txt")
    write_build_info(ready_root / "BUILD_INFO.json", commit)
    for package in outputs:
        copy_file(package, ready_root / "releases" / "packages" / package.name)
    output = PACKAGES / f"leadbridge-kso-full-project-{PACKAGE_VERSION}.zip"
    zip_path(ready_root, output, arc_root="leadbridge-kso")
    return output


def build() -> list[Path]:
    sys.path.insert(0, str(ROOT / "tools"))
    from sync_web_assets import sync  # pylint: disable=import-outside-toplevel

    sync()
    DIST.mkdir(exist_ok=True)
    BUILD.mkdir(parents=True, exist_ok=True)
    PACKAGES.mkdir(parents=True, exist_ok=True)
    commit = git_commit()
    component_zips = build_component_zips()
    outputs = component_zips[:]
    outputs.append(build_tools_pack("macos", component_zips, commit))
    outputs.append(build_tools_pack("windows", component_zips, commit))
    outputs.append(build_native_source_zip("windows-wpf", commit))
    outputs.append(build_native_source_zip("macos-dmg", commit))
    win_setup_app = PACKAGES / f"LeadBridgeKSO-Setup-Windows-{PACKAGE_VERSION}.exe"
    if win_setup_app.is_file():
        outputs.append(win_setup_app)
    mac_dmg_app = PACKAGES / f"LeadBridgeKSO-macOS-DMG-{PACKAGE_VERSION}.dmg"
    if mac_dmg_app.is_file():
        outputs.append(mac_dmg_app)
    write_integrity_metadata(outputs, commit)
    sync()
    outputs.append(build_full_project_zip(outputs, commit))
    write_integrity_metadata(outputs, commit)
    sync()
    verify_integrity()
    print("Built:")
    for path in outputs + [SHA256SUMS]:
        print(f"- {path.relative_to(ROOT)}")
    return outputs


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true", help="Verify existing release artifacts and metadata")
    args = parser.parse_args()
    if args.verify:
        verify_integrity()
        print("Release integrity metadata is valid.")
    else:
        build()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
