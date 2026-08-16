#!/usr/bin/env python3
"""Register the LeadBridge OCR loopback service for the current user."""

from __future__ import annotations

import argparse
import os
import platform
import plistlib
import subprocess
import sys
import time
import urllib.request
from pathlib import Path


LABEL = "io.leadbridge.ocrbridge"
HEALTH_URL = "http://127.0.0.1:17848/health"
SHUTDOWN_URL = "http://127.0.0.1:17848/shutdown"
BRIDGE_HEADER = "leadbridge-kso-ocr-v1"


def is_ready() -> bool:
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=0.7) as response:
            return response.status == 200
    except OSError:
        return False


def request_shutdown() -> None:
    request = urllib.request.Request(
        SHUTDOWN_URL,
        data=b"{}",
        method="POST",
        headers={"Content-Type": "application/json", "X-LeadBridge-Bridge": BRIDGE_HEADER},
    )
    try:
        with urllib.request.urlopen(request, timeout=1.5):
            pass
    except OSError:
        pass


def windows_pythonw() -> Path:
    current = Path(sys.executable).resolve()
    candidate = current.with_name("pythonw.exe")
    return candidate if candidate.is_file() else current


def install_windows(target: Path, bridge: Path) -> None:
    import winreg  # type: ignore[import-not-found]

    executable = windows_pythonw()
    command = f'"{executable}" "{bridge}"'
    key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as key:
        winreg.SetValueEx(key, "LeadBridgeKSOOCRBridge", 0, winreg.REG_SZ, command)

    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "DETACHED_PROCESS", 0)
    subprocess.Popen(
        [str(executable), str(bridge)],
        cwd=str(target),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=creationflags,
        close_fds=True,
    )


def install_macos(target: Path, bridge: Path) -> None:
    launch_agents = Path.home() / "Library" / "LaunchAgents"
    launch_agents.mkdir(parents=True, exist_ok=True)
    logs = target / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    plist_path = launch_agents / f"{LABEL}.plist"
    plist = {
        "Label": LABEL,
        "ProgramArguments": [str(Path(sys.executable).resolve()), str(bridge)],
        "RunAtLoad": True,
        "KeepAlive": {"SuccessfulExit": False},
        "ProcessType": "Background",
        "WorkingDirectory": str(target),
        "StandardOutPath": str(logs / "ocr_bridge.log"),
        "StandardErrorPath": str(logs / "ocr_bridge.log"),
    }
    with plist_path.open("wb") as output:
        plistlib.dump(plist, output)

    domain = f"gui/{os.getuid()}"
    subprocess.run(["launchctl", "bootout", f"{domain}/{LABEL}"], check=False, capture_output=True)
    subprocess.run(["launchctl", "bootstrap", domain, str(plist_path)], check=True)
    subprocess.run(["launchctl", "kickstart", "-k", f"{domain}/{LABEL}"], check=True)


def install_fallback(target: Path, bridge: Path) -> None:
    subprocess.Popen(
        [sys.executable, str(bridge)],
        cwd=str(target),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
        close_fds=True,
    )


def uninstall(target: Path) -> int:
    request_shutdown()
    system = platform.system().lower()
    if system == "windows":
        import winreg  # type: ignore[import-not-found]

        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE) as key:
                winreg.DeleteValue(key, "LeadBridgeKSOOCRBridge")
        except FileNotFoundError:
            pass
    elif system == "darwin":
        domain = f"gui/{os.getuid()}"
        subprocess.run(["launchctl", "bootout", f"{domain}/{LABEL}"], check=False, capture_output=True)
        (Path.home() / "Library" / "LaunchAgents" / f"{LABEL}.plist").unlink(missing_ok=True)
    print(f"LeadBridge OCR Bridge removed for {target}.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Install LeadBridge OCR Bridge")
    parser.add_argument("--target", type=Path, required=True)
    parser.add_argument("--uninstall", action="store_true")
    args = parser.parse_args()
    target = args.target.expanduser().resolve()
    if args.uninstall:
        return uninstall(target)
    bridge = target / "tools" / "ocr-bridge" / "ocr_bridge.py"
    if not bridge.is_file():
        print(f"OCR bridge script not found: {bridge}", file=sys.stderr)
        return 2
    if is_ready():
        print("LeadBridge OCR Bridge is already running.")
        return 0

    system = platform.system().lower()
    if system == "windows":
        install_windows(target, bridge)
    elif system == "darwin":
        install_macos(target, bridge)
    else:
        install_fallback(target, bridge)

    for _ in range(20):
        if is_ready():
            print("LeadBridge OCR Bridge is ready at 127.0.0.1:17848.")
            return 0
        time.sleep(0.25)
    print("LeadBridge OCR Bridge was registered but did not answer the health check.", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
