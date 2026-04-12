"""Assembles JavaScript bot modules into a single injectable script."""

import os
import json

# Order matters: engine.js first, then modules in dependency order
MODULE_ORDER = [
    "clicker.js",
    "purchaser.js",
    "shimmer.js",
    "wrinklers.js",
    "grandmapocalypse.js",
    "dragon.js",
    "seasons.js",
    "garden.js",
    "pantheon.js",
    "grimoire.js",
    "market.js",
    "sugar_lumps.js",
]


def assemble_bot(config=None):
    """Read all JS modules and concatenate into a single injectable script.

    Args:
        config: Optional dict of bot configuration overrides.

    Returns:
        A single JavaScript string ready for evaluate_js().
    """
    bot_dir = os.path.dirname(os.path.abspath(__file__))
    modules_dir = os.path.join(bot_dir, "modules")

    # Read engine.js (the harness)
    engine_path = os.path.join(bot_dir, "engine.js")
    with open(engine_path, "r", encoding="utf-8") as f:
        engine_code = f.read()

    # Read each module that exists
    module_parts = []
    for filename in MODULE_ORDER:
        filepath = os.path.join(modules_dir, filename)
        if os.path.isfile(filepath):
            with open(filepath, "r", encoding="utf-8") as f:
                module_parts.append(f"// === {filename} ===\n{f.read()}")

    # Read knowledge base (kb.js)
    kb_path = os.path.join(bot_dir, "kb.js")
    kb_code = ""
    if os.path.isfile(kb_path):
        with open(kb_path, "r", encoding="utf-8") as f:
            kb_code = f"// === Knowledge Base ===\n{f.read()}"

    # Build the final script
    parts = [
        "(function() {",
        "// Prevent double injection",
        "if (window.CookieCheater && window.CookieCheater.running) {",
        "  console.log('[CookieCheater] Already running, skipping injection.');",
        "  return;",
        "}",
        "",
        engine_code,
        "",
        kb_code,
        "",
        "\n\n".join(module_parts),
        "",
    ]

    # Inject config overrides if provided
    if config:
        parts.append(f"CookieCheater.setConfig({json.dumps(config)});")
        parts.append("")

    # Register the main loop
    parts.extend([
        "// Register the main loop into Cookie Clicker's logic hook",
        "Game.registerHook('logic', function() { CookieCheater.mainLoop(); });",
        "",
        "CookieCheater.running = true;",
        "console.log('[CookieCheater] Bot injected and running!');",
        "",
        "})();",
    ])

    return "\n".join(parts)
