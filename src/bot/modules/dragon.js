// Krumblor Dragon management
// Trains the dragon through levels and sets optimal auras.

CookieCheater.modules.dragon = {
    tick: function() {
        if (!CookieCheater.config.dragon_enabled) return;
        if (!CookieCheater.throttle("dragon", 5000)) return;

        // Check if dragon is available
        if (!Game.hasGod) return; // Dragon not unlocked yet
        if (typeof Game.dragonLevel === "undefined") return;

        // Train dragon if there's a training available
        this._trainDragon();

        // Set auras once dragon is mature enough
        this._setAuras();
    },

    _trainDragon: function() {
        // Dragon levels cost specific things - the game handles the UI
        // We can check if Game.dragonLevel < max and trigger training
        if (Game.dragonLevel >= 25) return; // Fully trained

        // The upgrade to train dragon is "A crumbly egg" initially,
        // then subsequent training upgrades appear
        // Training costs escalate - just buy if affordable
        var trainUpgrade = Game.Upgrades["A crumbly egg"];
        if (trainUpgrade && !trainUpgrade.bought && trainUpgrade.canBuy()) {
            trainUpgrade.buy();
            CookieCheater.log("dragon", "train", "Bought A crumbly egg");
            return;
        }

        // Check for dragon training button via Game.UpgradesByPool
        // Dragon training upgrades are in the "prestige" pool during ascension
        // In-game, dragon is trained by clicking the dragon in the special menu
        // We can use Game.specialTab and Game.UpgradesByPool.toggle
        if (Game.dragonLevel > 0 && Game.dragonLevel < 25) {
            // Try to train via the Game API
            try {
                if (Game.dragonLevels && Game.dragonLevels[Game.dragonLevel]) {
                    var level = Game.dragonLevels[Game.dragonLevel];
                    if (level.cost && level.cost()) {
                        // Cost condition met, train
                        Game.dragonLevel++;
                        Game.recalculateGains = 1;
                        if (Game.dragonLevels[Game.dragonLevel] && Game.dragonLevels[Game.dragonLevel].action) {
                            Game.dragonLevels[Game.dragonLevel].action();
                        }
                        CookieCheater.log("dragon", "level_up", "Dragon level " + Game.dragonLevel);
                    }
                }
            } catch(e) {
                // Dragon API varies between versions
            }
        }
    },

    _setAuras: function() {
        if (Game.dragonLevel < 5) return; // Need level 5+ for first aura

        // Aura IDs:
        // 0 = No aura
        // 1 = Breath of Milk (+5% milk effect)
        // 2 = Dragon Cursor (clicking bonus)
        // 3 = Elder Battalion (CPS bonus with grandmas)
        // 4 = Reaper of Fields (golden cookie bonus)
        // 5 = Earth Shatterer (building CPS bonus)
        // 6 = Master of the Armory (upgrade bonus)
        // 7 = Fierce Hoarder (cheaper buildings)
        // 8 = Dragon God (prestige bonus)
        // 9 = Arcane Aura (golden cookie frequency)
        // 10 = Dragonflight (click bonus from clicking)
        // 11 = Breath of Milk is generally best for passive
        // 15 = Radiant Appetite (2x CPS) -- best aura

        try {
            if (typeof Game.dragonAura === "undefined") return;

            // Set first aura to Radiant Appetite (15) if available, else Breath of Milk (1)
            var wantedAura1 = 15; // Radiant Appetite
            if (Game.dragonLevel < 21) wantedAura1 = 1; // Breath of Milk until Radiant is unlocked

            if (Game.dragonAura !== wantedAura1) {
                Game.dragonAura = wantedAura1;
                Game.recalculateGains = 1;
                CookieCheater.log("dragon", "aura1", "Set aura 1 to " + wantedAura1);
            }

            // Second aura (requires dragon level 25)
            if (Game.dragonLevel >= 25 && typeof Game.dragonAura2 !== "undefined") {
                var wantedAura2 = 1; // Breath of Milk
                if (Game.dragonAura2 !== wantedAura2) {
                    Game.dragonAura2 = wantedAura2;
                    Game.recalculateGains = 1;
                    CookieCheater.log("dragon", "aura2", "Set aura 2 to " + wantedAura2);
                }
            }
        } catch(e) {
            // Aura API may not be available
        }
    }
};
