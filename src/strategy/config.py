"""Bot configuration with sensible defaults."""

from dataclasses import dataclass, field, asdict


@dataclass
class BotConfig:
    # Clicking
    auto_click: bool = True
    clicks_per_frame: int = 15
    click_only_during_buffs: bool = False

    # Purchasing
    max_payback_seconds: float = 600
    save_for_upgrades: bool = True
    buy_upgrades_under_cps_minutes: float = 10.0

    # Golden cookies
    auto_pop_golden: bool = True
    auto_pop_reindeer: bool = True

    # Ascension
    first_ascension_target: int = 365
    ascension_multiplier: float = 2.0
    auto_ascend: bool = True

    # Grandmapocalypse: "pledge", "covenant", or "full"
    grandmapocalypse_strategy: str = "pledge"

    # Wrinklers
    pop_wrinklers: bool = True
    wrinkler_min_feed_minutes: int = 30

    # Seasons
    auto_season_cycle: bool = True

    # Minigames
    garden_enabled: bool = True
    pantheon_enabled: bool = True
    grimoire_enabled: bool = True
    market_enabled: bool = True

    # Sugar lumps
    auto_harvest_lumps: bool = True
    lump_spend_priority: list = field(default_factory=lambda: [
        "Wizard Tower", "Farm", "Bank", "Temple"
    ])

    # Dragon
    dragon_enabled: bool = True

    # Saving
    auto_save_interval_minutes: int = 5

    def to_dict(self):
        return asdict(self)
