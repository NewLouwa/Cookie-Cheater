"""High-level bridge between Python and the Cookie Clicker game via CDP."""

import json
import os
import time
from datetime import datetime

from .connection import ChromeConnection


class GameBridge:
    """Wraps ChromeConnection with game-specific operations."""

    def __init__(self, connection: ChromeConnection):
        self.connection = connection

    def inject_bot(self, js_code):
        """Inject the assembled JavaScript bot into the game page."""
        self.connection.evaluate_js(js_code)

    def is_bot_running(self):
        """Check if the bot is already injected and running."""
        result = self.connection.evaluate_js(
            "typeof CookieCheater !== 'undefined' && CookieCheater.running ? 'yes' : 'no'"
        )
        return result == "yes"

    def get_status(self):
        """Query the injected bot for full game status."""
        return self.connection.evaluate_js("JSON.stringify(CookieCheater.getStatus())")

    def get_action_log(self, limit=50):
        """Get recent bot actions."""
        return self.connection.evaluate_js(
            f"JSON.stringify(CookieCheater.getActionLog({limit}))"
        )

    def set_config(self, config):
        """Update bot configuration at runtime."""
        self.connection.evaluate_js(f"CookieCheater.setConfig({json.dumps(config)})")

    def get_config(self):
        """Get current bot configuration."""
        return self.connection.evaluate_js("JSON.stringify(CookieCheater.config)")

    def export_save(self):
        """Export the current game save as a string."""
        return self.connection.evaluate_js("Game.WriteSave(1)")

    def import_save(self, save_string):
        """Import a game save string."""
        safe = save_string.replace('"', '\\"')
        self.connection.evaluate_js(f'Game.ImportSaveCode("{safe}");')

    def save_to_file(self, saves_dir="saves"):
        """Export game save and write to a timestamped file."""
        os.makedirs(saves_dir, exist_ok=True)
        save_data = self.export_save()
        if not save_data:
            return None

        bakery_name = self.connection.evaluate_js("Game.bakeryName") or "Unknown"
        safe_name = "".join(c for c in bakery_name if c.isalnum() or c in " _-").strip()
        safe_name = safe_name.replace(" ", "_") or "save"

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{safe_name}_{timestamp}.txt"
        filepath = os.path.join(saves_dir, filename)

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(save_data)

        # Also save a "latest" copy
        latest_path = os.path.join(saves_dir, f"{safe_name}.txt")
        with open(latest_path, "w", encoding="utf-8") as f:
            f.write(save_data)

        return filepath

    def trigger_ascension(self):
        """Start the ascension process."""
        self.connection.evaluate_js("Game.Ascend()")

    def reincarnate(self):
        """Complete ascension and start a new run."""
        self.connection.evaluate_js("Game.Reincarnate()")

    def buy_heavenly_upgrade(self, upgrade_id):
        """Buy a heavenly upgrade by ID during ascension."""
        self.connection.evaluate_js(f"Game.UpgradesById[{upgrade_id}].buy()")

    def set_language_english(self):
        """Set the game language to English."""
        self.connection.evaluate_js(
            "if (typeof LocalizeStandard !== 'undefined') LocalizeStandard();"
        )
