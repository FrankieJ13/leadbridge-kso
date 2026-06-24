#!/usr/bin/env python3
"""Shared installer helper for LeadBridge KSO tools packs."""

from __future__ import annotations

import argparse
import os
import platform
import shutil
from pathlib import Path


def source_root(script_path: Path) -> Path:
    candidates = [
        script_path.parent,
        script_path.parent.parent,
        script_path.parent.parent.parent,
    ]
    for candidate in candidates:
        if (candidate / "apps" / "leadbridge-web").exists() or (candidate / "tools" / "leadbridge").exists():
            return candidate.resolve()
    return script_path.parent.resolve()


def default_target() -> Path:
    if platform.system().lower().startswith("win"):
        return Path("C:/LeadBridgeKSO")
    return Path.home() / "LeadBridgeKSO"


def copy_tree(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


def first_existing(*paths: Path) -> Path:
    for path in paths:
        if path.exists():
            return path
    raise FileNotFoundError("Missing required source path: " + " or ".join(str(p) for p in paths))


def install(root: Path, target: Path) -> None:
    for name in ("exports", "ocr_results", "tools", "archives", "launchers"):
        (target / name).mkdir(parents=True, exist_ok=True)

    copy_tree(first_existing(root / "apps" / "leadbridge-web", root / "tools" / "leadbridge"), target / "tools" / "leadbridge")
    copy_tree(first_existing(root / "apps" / "max-chat-local-exporter", root / "tools" / "max-chat-local-exporter"), target / "tools" / "max-chat-local-exporter")
    copy_tree(first_existing(root / "apps" / "max-chat-ocr-postprocessor", root / "tools" / "max-chat-ocr-postprocessor"), target / "tools" / "max-chat-ocr-postprocessor")

    archives = first_existing(root / "releases" / "packages", root / "archives")
    for item in archives.iterdir():
        if item.is_file():
            shutil.copy2(item, target / "archives" / item.name)

    launchers = first_existing(root / "tools" / "launcher", root / "launchers")
    for item in launchers.iterdir():
        if item.is_file():
            shutil.copy2(item, target / "launchers" / item.name)

    readme = root / "README_FIRST.txt"
    if not readme.exists():
        readme = root / "README.md"
    if readme.exists():
        shutil.copy2(readme, target / "README_FIRST.txt")


def main() -> int:
    parser = argparse.ArgumentParser(description="Install LeadBridge KSO local tools")
    parser.add_argument("--target", type=Path, default=default_target(), help="Installation directory")
    args = parser.parse_args()

    root = source_root(Path(__file__).resolve())
    target = args.target.expanduser().resolve() if not os.name == "nt" else args.target
    print(f"Source: {root}")
    print(f"Target: {target}")
    install(root, target)
    print("Installed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
