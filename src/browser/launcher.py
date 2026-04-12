"""Browser detection, launch, and game readiness helpers."""

import os
import subprocess
import sys
import time

import requests
from rich.console import Console

console = Console()

COOKIE_CLICKER_URL = "https://orteil.dashnet.org/cookieclicker/"


def find_browser():
    """Find the system's default Chromium-based browser (Windows, Linux, macOS)."""
    import shutil
    import re

    if sys.platform == "win32":
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                                r"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice") as key:
                prog_id = winreg.QueryValueEx(key, "ProgId")[0]

            with winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, rf"{prog_id}\shell\open\command") as key:
                command = winreg.QueryValueEx(key, "")[0]

            match = re.match(r'"([^"]+)"', command)
            if match and os.path.isfile(match.group(1)):
                return match.group(1)
        except Exception:
            pass

        fallback = [
            r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe"),
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        ]

    elif sys.platform.startswith("linux"):
        try:
            result = subprocess.run(
                ["xdg-settings", "get", "default-web-browser"],
                capture_output=True, text=True, timeout=5
            )
            desktop_file = result.stdout.strip()
            browser_name = desktop_file.replace(".desktop", "")
            path = shutil.which(browser_name)
            if path:
                return path
        except Exception:
            pass

        for name in ["brave-browser", "brave", "google-chrome", "google-chrome-stable",
                      "chrome", "chromium-browser", "chromium", "microsoft-edge"]:
            path = shutil.which(name)
            if path:
                return path
        fallback = []

    elif sys.platform == "darwin":
        fallback = [
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ]
    else:
        fallback = []

    for path in fallback:
        if os.path.isfile(path):
            return path

    return None


def is_debug_port_open(port):
    """Check if Chrome's debug port is already responding."""
    try:
        requests.get(f"http://localhost:{port}/json", timeout=2)
        return True
    except Exception:
        return False


def launch_browser(port, web_port=None):
    """Launch a new browser window with remote debugging and Cookie Clicker."""
    browser_path = find_browser()
    if not browser_path:
        return None

    browser_name = "Brave" if "brave" in browser_path.lower() else \
                   "Edge" if "edge" in browser_path.lower() else "Chrome"

    console.print(f"[cyan]Launching {browser_name} with debug port {port}...[/cyan]")

    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__)))), ".browser_profile")

    urls = [COOKIE_CLICKER_URL]
    if web_port:
        urls.append(f"http://localhost:{web_port}")

    subprocess.Popen(
        [
            browser_path,
            f"--remote-debugging-port={port}",
            "--remote-allow-origins=*",
            f"--user-data-dir={data_dir}",
            "--new-window",
        ] + urls,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    return browser_name


def wait_for_browser(port, timeout=30):
    """Wait for browser debug port to become available."""
    for i in range(timeout):
        try:
            response = requests.get(f"http://localhost:{port}/json", timeout=2)
            if response.status_code == 200:
                return True
        except Exception:
            pass
        time.sleep(1)
        if i % 5 == 4:
            console.print(f"[dim]Still waiting for browser... ({i+1}s)[/dim]")
    return False


def wait_for_cookie_clicker(connection, timeout=60):
    """Wait for Cookie Clicker to fully load (Game object available)."""
    console.print("[dim]Waiting for Cookie Clicker to load...[/dim]")
    for i in range(timeout):
        try:
            result = connection.evaluate_js(
                "typeof Game !== 'undefined' && Game.ready ? 'ready' : 'loading'"
            )
            if result == "ready":
                return True
        except Exception:
            pass
        time.sleep(1)
        if i % 10 == 9:
            console.print(f"[dim]Still loading... ({i+1}s)[/dim]")
    return False
