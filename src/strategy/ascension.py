"""Ascension timing and heavenly upgrade purchase logic."""

import math

# Heavenly upgrades to buy in priority order (by name)
# These are the most impactful upgrades that should be purchased first
HEAVENLY_PRIORITY = [
    "Legacy",
    "Heavenly cookies",
    "How to bake your dragon",
    "Heavenly luck",
    "Lasting fortune",
    "Season switcher",
    "Starter kit",
    "Starter kitchen",
    "Box of brand biscuits",
    "Box of macarons",
    "Permanent upgrade slot I",
    "Permanent upgrade slot II",
    "Permanent upgrade slot III",
    "Permanent upgrade slot IV",
    "Permanent upgrade slot V",
    "Heavenly chip secret",
    "Heavenly cookie stand",
    "Heavenly bakery",
    "Heavenly confectionery",
    "Heavenly key",
    "Angel chorus",
    "Twin Gates of Transcendence",
    "Sugar craving",
    "Sugar aging process",
    "Sugar baking",
]


def calculate_prestige(cookies_baked):
    """Calculate prestige level from total cookies baked all time.

    Formula: prestige = floor(sqrt(cookies_baked / 1e12))
    """
    if cookies_baked < 1e12:
        return 0
    return int((cookies_baked / 1e12) ** (1/3))


def cookies_for_prestige(target_prestige):
    """Calculate cookies needed to reach a target prestige level."""
    return (target_prestige ** 3) * 1e12


def should_ascend(game_state, config):
    """Determine if the bot should ascend.

    Args:
        game_state: Dict with 'prestige', 'cookiesEarned', 'heavenlyChips', etc.
        config: BotConfig instance.

    Returns:
        (should_ascend: bool, reason: str)
    """
    current_prestige = game_state.get("prestige", 0)
    cookies_earned = game_state.get("cookiesEarned", 0)
    potential_prestige = calculate_prestige(cookies_earned)
    new_levels = potential_prestige - current_prestige

    if current_prestige == 0:
        # First ascension: wait for enough levels to buy key upgrades
        target = config.first_ascension_target
        if new_levels >= target:
            return True, f"First ascension: {new_levels} new prestige levels (target: {target})"
        return False, f"First ascension: {new_levels}/{target} prestige levels"

    # Subsequent ascensions: ascend when prestige multiplies enough
    ratio = potential_prestige / max(current_prestige, 1)
    if ratio >= config.ascension_multiplier:
        return True, f"Prestige ratio {ratio:.1f}x (target: {config.ascension_multiplier}x)"

    return False, f"Prestige ratio {ratio:.2f}x / {config.ascension_multiplier}x needed"


def get_heavenly_buy_list(game_bridge):
    """Get the list of heavenly upgrades to buy during ascension, in priority order.

    Returns list of upgrade IDs that are affordable and not yet bought.
    """
    buy_list = []

    for name in HEAVENLY_PRIORITY:
        # Query the game for this upgrade's status
        result = game_bridge.connection.evaluate_js(
            f'(function() {{'
            f'  var u = Game.Upgrades["{name}"];'
            f'  if (!u) return null;'
            f'  return JSON.stringify({{id: u.id, bought: u.bought ? 1 : 0, canBuy: u.canBuy() ? 1 : 0, price: u.basePrice}});'
            f'}})()'
        )
        if result and not result.get("bought"):
            buy_list.append(result)

    return buy_list
