#!/usr/bin/env python3
"""
CookieCheater Web UI - Launches browser, injects bot, starts dashboard.

Usage:
    python run_web.py                    # Auto-launch browser
    python run_web.py --no-launch        # Connect to existing browser
    python run_web.py --port 9222        # Custom debug port
    python run_web.py --web-port 8000    # Custom web UI port
"""

import argparse
import sys
import time

import uvicorn
from rich.console import Console

from src.browser.connection import ChromeConnection
from src.browser.launcher import (
    find_browser, is_debug_port_open, launch_browser,
    wait_for_browser, wait_for_cookie_clicker, COOKIE_CLICKER_URL
)
from src.browser.game_bridge import GameBridge
from src.bot.assembler import assemble_bot
from src.strategy.config import BotConfig
from src.web.app import create_app

console = Console()


def main():
    parser = argparse.ArgumentParser(description="CookieCheater - Cookie Clicker Bot Dashboard")
    parser.add_argument("--port", type=int, default=9222, help="Chrome debug port (default: 9222)")
    parser.add_argument("--web-port", type=int, default=8000, help="Web UI port (default: 8000)")
    parser.add_argument("--no-launch", action="store_true", help="Don't auto-launch browser")
    parser.add_argument("--interval", type=int, default=2, help="Poll interval in seconds (default: 2)")
    parser.add_argument("--db", type=str, default="cheater.db", help="Database path (default: cheater.db)")
    args = parser.parse_args()

    console.print("[bold red]CookieCheater[/bold red] - Cookie Clicker Optimization Bot")
    console.print()

    # --- Browser launch ---
    already_running = is_debug_port_open(args.port)

    if already_running:
        console.print(f"[green]Browser already running on port {args.port}[/green]")
    elif not args.no_launch:
        browser_name = launch_browser(args.port, web_port=args.web_port)
        if not browser_name:
            console.print("[bold red]No browser found![/bold red]")
            console.print("[yellow]Install Brave, Chrome, or Edge, or launch manually:[/yellow]")
            console.print(f'  [cyan]chrome.exe --remote-debugging-port={args.port} {COOKIE_CLICKER_URL}[/cyan]')
            sys.exit(1)

        console.print(f"[dim]Waiting for {browser_name}...[/dim]")
        if not wait_for_browser(args.port):
            console.print("[bold red]Browser didn't start in time.[/bold red]")
            sys.exit(1)
    else:
        if not already_running:
            console.print(f"[bold red]No browser on port {args.port}[/bold red]")
            console.print(f'  [cyan]chrome.exe --remote-debugging-port={args.port} {COOKIE_CLICKER_URL}[/cyan]')
            sys.exit(1)

    # --- Connect to Cookie Clicker ---
    try:
        connection = ChromeConnection(port=args.port)
        connection.find_cookie_clicker_tab()
        connection.connect()
        console.print("[green]Connected to Cookie Clicker tab![/green]")
    except (ConnectionError, RuntimeError) as e:
        console.print(f"[bold red]{e}[/bold red]")
        sys.exit(1)

    if not wait_for_cookie_clicker(connection):
        console.print("[bold red]Cookie Clicker didn't load in time.[/bold red]")
        connection.close()
        sys.exit(1)

    console.print("[green]Cookie Clicker loaded![/green]")

    # --- Set language and inject bot ---
    bridge = GameBridge(connection)
    bridge.set_language_english()

    if bridge.is_bot_running():
        console.print("[yellow]Bot already injected, skipping re-injection.[/yellow]")
    else:
        console.print("[cyan]Injecting bot...[/cyan]")
        config = BotConfig()
        js_code = assemble_bot(config.to_dict())
        bridge.inject_bot(js_code)
        time.sleep(0.5)

        if bridge.is_bot_running():
            console.print("[bold green]Bot is running![/bold green]")
        else:
            console.print("[bold red]Bot injection may have failed. Check browser console.[/bold red]")

    # --- Start web dashboard ---
    console.print(f"\n[bold cyan]Dashboard: http://localhost:{args.web_port}[/bold cyan]")
    console.print("[dim]Press Ctrl+C to stop.[/dim]\n")

    app = create_app(bridge, db_path=args.db, poll_interval=args.interval)

    try:
        uvicorn.run(app, host="0.0.0.0", port=args.web_port, log_level="warning")
    except KeyboardInterrupt:
        pass
    finally:
        # Save before exit
        try:
            filepath = bridge.save_to_file()
            if filepath:
                console.print(f"[green]Game saved: {filepath}[/green]")
        except Exception:
            pass
        connection.close()
        console.print("[yellow]Stopped.[/yellow]")


if __name__ == "__main__":
    main()
