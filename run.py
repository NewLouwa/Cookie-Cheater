#!/usr/bin/env python3
"""
CookieCheater - Cookie Clicker Optimization Bot

Launches browser, injects the bot, and starts the web dashboard.

Usage:
    python run.py              # Auto-launch browser + web UI
    python run.py --no-launch  # Connect to already-running browser
"""

import os
import subprocess
import sys

DONE_FLAG = ".deps_installed"
REQUIREMENTS = "requirements.txt"


def install_dependencies():
    """Install dependencies from requirements.txt."""
    print("Installing dependencies...")
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "-r", REQUIREMENTS, "-q"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"Error installing dependencies:\n{result.stderr}")
        sys.exit(1)

    with open(DONE_FLAG, "w") as f:
        f.write("done")
    print("Dependencies installed.")


def check_dependencies():
    if os.path.exists(DONE_FLAG):
        return True
    if not os.path.exists(REQUIREMENTS):
        print(f"Error: {REQUIREMENTS} not found.")
        sys.exit(1)
    return False


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    os.makedirs("saves", exist_ok=True)

    if not check_dependencies():
        install_dependencies()

    # Forward all args to run_web.py
    cmd = [sys.executable, "run_web.py"] + sys.argv[1:]

    try:
        result = subprocess.run(cmd)
        sys.exit(result.returncode)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
