#!/usr/bin/env python3
"""Build GitHub-ready LeadBridge KSO release ZIP files."""

from __future__ import annotations

import shutil
import stat
import zipfile
from pathlib import Path


PACKAGE_VERSION = "v6.4.24.1144"
MATCHER_VERSION = "v6.4.24.1104"
EXPORTER_VERSION = "v0.4.1"
OCR_VERSION = "v0.3.1"

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
BUILD = DIST / "release-build"
PACKAGES = ROOT / "releases" / "packages"


def reset_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True)


def copytree(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns("__pycache__", ".DS_Store"))


def copy_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def ensure_executable(path: Path) -> None:
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def zip_path(src: Path, dst: Path, arc_root: str | None = None) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        dst.unlink()
    with zipfile.ZipFile(dst, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        if src.is_file():
            zf.write(src, arc_root or src.name)
            return
        base = src.parent if arc_root else src
        for path in sorted(src.rglob("*")):
            if path.name == ".DS_Store" or "__pycache__" in path.parts:
                continue
            arcname = path.relative_to(base)
            if not arc_root and path == src:
                continue
            zf.write(path, arcname)


def build_component_zips() -> list[Path]:
    outputs = []

    exporter_zip = PACKAGES / f"max-chat-local-exporter-{EXPORTER_VERSION}.zip"
    zip_path(ROOT / "apps" / "max-chat-local-exporter", exporter_zip)
    outputs.append(exporter_zip)

    ocr_zip = PACKAGES / f"max-chat-ocr-postprocessor-{OCR_VERSION}.zip"
    zip_path(ROOT / "apps" / "max-chat-ocr-postprocessor", ocr_zip)
    outputs.append(ocr_zip)

    html_build = BUILD / f"leadbridge-offline-html-{MATCHER_VERSION}"
    reset_dir(html_build)
    copy_file(ROOT / "apps" / "leadbridge-web" / "index.html", html_build / "offline_phone_matcher.html")
    copy_file(ROOT / "apps" / "leadbridge-web" / "README.md", html_build / "README.md")
    html_zip = PACKAGES / f"leadbridge-offline-html-{MATCHER_VERSION}.zip"
    zip_path(html_build, html_zip)
    outputs.append(html_zip)

    return outputs


def build_tools_pack(platform_name: str, component_zips: list[Path]) -> Path:
    is_macos = platform_name == "macos"
    folder_name = f"LeadBridgeKSO-{'macOS' if is_macos else 'Windows'}-{PACKAGE_VERSION}"
    pack = BUILD / folder_name
    reset_dir(pack)

    copytree(ROOT / "apps" / "leadbridge-web", pack / "tools" / "leadbridge")
    copytree(ROOT / "apps" / "max-chat-local-exporter", pack / "tools" / "max-chat-local-exporter")
    copytree(ROOT / "apps" / "max-chat-ocr-postprocessor", pack / "tools" / "max-chat-ocr-postprocessor")

    for archive in component_zips:
        copy_file(archive, pack / "archives" / archive.name)

    copy_file(ROOT / "releases" / "manifest.json", pack / "manifest.json")
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
        out = PACKAGES / f"leadbridge-kso-tools-macos-{PACKAGE_VERSION}.zip"
    else:
        copy_file(ROOT / "tools" / "installers" / "install_windows.ps1", pack / "install_windows.ps1")
        copy_file(ROOT / "tools" / "launcher" / "open_leadbridge_windows.bat", pack / "launchers" / "open_leadbridge.bat")
        copy_file(ROOT / "tools" / "launcher" / "run_ocr_windows.bat", pack / "launchers" / "run_ocr_windows.bat")
        out = PACKAGES / f"leadbridge-kso-tools-windows-{PACKAGE_VERSION}.zip"

    zip_path(pack, out, arc_root=folder_name)
    return out


def copy_repo_for_github_ready(target: Path) -> None:
    reset_dir(target)
    ignore = shutil.ignore_patterns(".git", "dist", ".DS_Store", "__pycache__", "*.pyc")
    for item in ROOT.iterdir():
        if item.name in {".git", "dist"}:
            continue
        dst = target / item.name
        if item.is_dir():
            shutil.copytree(item, dst, ignore=ignore)
        else:
            shutil.copy2(item, dst)


def copy_web_assets(target: Path) -> None:
    reset_dir(target)
    copy_file(ROOT / "index.html", target / "index.html")
    for name in ("manifest.webmanifest", "service-worker.js"):
        source = ROOT / name
        if source.exists():
            copy_file(source, target / name)
    icons = ROOT / "icons"
    if icons.exists():
        shutil.copytree(icons, target / "icons", ignore=shutil.ignore_patterns(".DS_Store"))
    manifest = ROOT / "releases" / "manifest.json"
    if manifest.exists():
        copy_file(manifest, target / "releases" / "manifest.json")


def build_native_source_zip(kind: str) -> Path:
    if kind == "windows-wpf":
        source = ROOT / "native" / "windows-wpf"
        package = BUILD / f"leadbridge-kso-native-windows-wpf-build-{PACKAGE_VERSION}"
        reset_dir(package)
        shutil.copytree(source, package, dirs_exist_ok=True, ignore=shutil.ignore_patterns("bin", "obj", "dist", "Web", ".DS_Store"))
        copy_web_assets(package / "LeadBridgeKSO.Windows" / "Web")
        out = PACKAGES / f"leadbridge-kso-native-windows-wpf-build-{PACKAGE_VERSION}.zip"
    elif kind == "macos-dmg":
        source = ROOT / "native" / "macos-dmg"
        package = BUILD / f"leadbridge-kso-native-macos-dmg-build-{PACKAGE_VERSION}"
        reset_dir(package)
        shutil.copytree(source, package, dirs_exist_ok=True, ignore=shutil.ignore_patterns("build", "dist", "Web", ".DS_Store"))
        copy_web_assets(package / "Web")
        ensure_executable(package / "build_dmg.sh")
        out = PACKAGES / f"leadbridge-kso-native-macos-dmg-build-{PACKAGE_VERSION}.zip"
    else:
        raise ValueError(f"Unknown native source package kind: {kind}")

    zip_path(package, out)
    return out


def build_github_ready_zip() -> Path:
    ready_root = BUILD / "leadbridge-kso"
    copy_repo_for_github_ready(ready_root)
    out = DIST / f"leadbridge-kso-github-ready-{PACKAGE_VERSION}.zip"
    zip_path(ready_root, out, arc_root="leadbridge-kso")
    return out


def main() -> int:
    DIST.mkdir(exist_ok=True)
    BUILD.mkdir(parents=True, exist_ok=True)
    PACKAGES.mkdir(parents=True, exist_ok=True)

    component_zips = build_component_zips()
    outputs = component_zips[:]
    outputs.append(build_tools_pack("macos", component_zips))
    outputs.append(build_tools_pack("windows", component_zips))
    outputs.append(build_native_source_zip("windows-wpf"))
    outputs.append(build_native_source_zip("macos-dmg"))
    outputs.append(build_github_ready_zip())

    print("Built:")
    for path in outputs:
        print(f"- {path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
