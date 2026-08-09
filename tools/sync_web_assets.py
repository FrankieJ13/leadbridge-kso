#!/usr/bin/env python3
"""Sync or verify generated Web copies from apps/leadbridge-web canonical source."""

from __future__ import annotations

import argparse
import filecmp
import shutil
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "apps" / "leadbridge-web"
ROOT_FILES = ("index.html", "app.css", "app.js", "manifest.webmanifest", "service-worker.js")
ROOT_TREES = ("icons", "src")


def same_file(source: Path, target: Path) -> bool:
    return target.is_file() and filecmp.cmp(source, target, shallow=False)


def tree_files(root: Path) -> dict[str, Path]:
    return {str(path.relative_to(root)): path for path in root.rglob("*") if path.is_file()}


def same_tree(source: Path, target: Path) -> bool:
    if not target.is_dir():
        return False
    source_files = tree_files(source)
    target_files = tree_files(target)
    return source_files.keys() == target_files.keys() and all(
        same_file(source_files[name], target_files[name]) for name in source_files
    )


def verify() -> list[str]:
    drift = []
    for name in ROOT_FILES:
        if not same_file(WEB / name, ROOT / name):
            drift.append(name)
    for name in ROOT_TREES:
        if not same_tree(WEB / name, ROOT / name):
            drift.append(f"{name}/")
    if not same_file(WEB / "index.html", WEB / "offline_phone_matcher.html"):
        drift.append("apps/leadbridge-web/offline_phone_matcher.html")
    if not same_file(ROOT / "releases" / "manifest.json", WEB / "releases" / "manifest.json"):
        drift.append("apps/leadbridge-web/releases/manifest.json")
    return drift


def sync() -> None:
    for name in ROOT_FILES:
        shutil.copy2(WEB / name, ROOT / name)
    for name in ROOT_TREES:
        target = ROOT / name
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(WEB / name, target)
    shutil.copy2(WEB / "index.html", WEB / "offline_phone_matcher.html")
    (WEB / "releases").mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / "releases" / "manifest.json", WEB / "releases" / "manifest.json")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true", help="Fail if generated copies drift from canonical Web source")
    args = parser.parse_args()
    if args.verify:
        drift = verify()
        if drift:
            print("Generated Web assets are out of sync:", file=sys.stderr)
            for name in drift:
                print(f"- {name}", file=sys.stderr)
            return 1
        print("Canonical Web assets are in sync.")
        return 0
    sync()
    print("Synced canonical Web assets.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
