// Krumblor Dragon management with correct aura values
//
// Dragon Auras (by ID, from game source):
//   0  = No aura
//   1  = Breath of Milk      - Kittens 5% more effective
//   2  = Dragon Cursor        - +5% extra CPS from clicking
//   3  = Elder Battalion      - +100% bonus per grandma type
//   4  = Reaper of Fields     - +5% golden cookie gains
//   5  = Earth Shatterer      - Buildings +5% CPS
//   6  = Master of the Armory - Upgrades +10% cheaper
//   7  = Fierce Hoarder       - +25% cookie storage
//   8  = Dragon God           - +5% prestige bonus (at high prestige)
//   9  = Arcane Aura          - +5% golden cookie frequency
//   10 = Dragonflight         - Chance for x1111 click buff from GC
//   11 = Radiant Appetite     - +100% CPS (x2 multiplier) <-- BEST
//   12 = Dragon's Fortune     - +111% CPS per GC on screen
//   13 = Dragon's Curve       - +5% sugar lump growth speed
//   14 = Reality Bending      - +5% all synergies
//   15 = Dragon Orbs          - +10% chance of rare drops
//   16 = Supreme Intellect    - Research 5% faster
//   17 = Dragon Guts          - +2 max wrinklers, +5% wrinkler cookies
//   18 = Dragon Heart         - +30% golden cookie duration

CookieCheater.modules.dragon = {
    tick: function() {
        if (!CookieCheater.config.dragon_enabled) return;
        if (!CookieCheater.throttle("dragon", 10000)) return;

        if (typeof Game.dragonLevel === "undefined") return;
        if (Game.dragonLevel <= 0 && !Game.Has("How to bake your dragon")) return;

        this._trainDragon();
        if (Game.dragonLevel >= 5) this._setAuras();
    },

    _trainDragon: function() {
        if (Game.dragonLevel >= 25) return; // Fully trained

        // Buy "A crumbly egg" to start dragon training
        var egg = Game.Upgrades["A crumbly egg"];
        if (egg && !egg.bought && egg.unlocked && egg.canBuy()) {
            egg.buy();
            CookieCheater.log("dragon", "train", "Bought A crumbly egg");
            return;
        }

        // Pet/train the dragon if available
        if (Game.dragonLevel > 0 && Game.dragonLevel < 25) {
            try {
                if (Game.dragonLevels && Game.dragonLevels[Game.dragonLevel]) {
                    var level = Game.dragonLevels[Game.dragonLevel];
                    // Check if we can afford the training cost
                    if (typeof level.cost === "function" && level.cost()) {
                        // Cost met - execute the training action
                        if (typeof level.action === "function") level.action();
                        Game.dragonLevel++;
                        Game.recalculateGains = 1;
                        CookieCheater.log("dragon", "level_up", "Dragon level " + Game.dragonLevel);
                    }
                }
            } catch(e) {}
        }
    },

    // Default aura: Dragonflight (10) — chance for x1111 click buff from golden cookies
    // During combo: swap to Radiant Appetite (11) = x2 CPS for max combo value
    // After combo: swap back to Dragonflight
    //
    // Aura swap costs 50 buildings of the most-built type!
    // So we sell 50, swap, then rebuy 50 after.
    _auraSwapping: false,

    _setAuras: function() {
        try {
            var comboTier = CookieCheater._comboTier || 0;

            // Desired auras based on state
            var wantedAura1, wantedAura2;

            if (comboTier >= 2) {
                // During combo: Radiant Appetite (x2 CPS) to maximize combo value
                wantedAura1 = 11; // Radiant Appetite
                wantedAura2 = 1;  // Breath of Milk
            } else {
                // Default: Dragonflight — chance for x1111 click buff from golden cookies
                wantedAura1 = 10; // Dragonflight
                wantedAura2 = 11; // Radiant Appetite (if dual aura available)
            }

            // Fallbacks for low dragon level
            if (Game.dragonLevel < 21) {
                wantedAura1 = 10; // Dragonflight always available at level 5+
                wantedAura2 = 5;  // Earth Shatterer
            }
            if (Game.dragonLevel < 5) return;

            // Check if aura 1 needs changing
            if (Game.dragonAura !== wantedAura1) {
                this._swapAura(1, wantedAura1);
            }

            // Aura 2 (level 25+)
            if (Game.dragonLevel >= 25 && typeof Game.dragonAura2 !== "undefined") {
                if (Game.dragonAura2 !== wantedAura2) {
                    this._swapAura(2, wantedAura2);
                }
            }
        } catch(e) {}
    },

    _swapAura: function(slot, auraId) {
        // Aura swapping costs sacrificing 50 buildings!
        // Sell 50 of cheapest building, swap, rebuy
        if (this._auraSwapping) return; // Prevent double-swap
        this._auraSwapping = true;

        // Find cheapest building with 50+ to sell
        var target = null;
        for (var i = 0; i < Game.ObjectsById.length; i++) {
            var b = Game.ObjectsById[i];
            if (b.locked || b.amount < 55) continue; // Need 55+ to keep 5 after sell
            if (!target || b.price < target.price) target = b;
        }

        if (!target) {
            // Can't afford the swap — no building has 55+
            this._auraSwapping = false;
            return;
        }

        // Sell 50
        target.sell(50);

        // Set aura
        if (slot === 1) {
            Game.dragonAura = auraId;
        } else {
            Game.dragonAura2 = auraId;
        }
        Game.recalculateGains = 1;

        // Rebuy 50 immediately
        target.buy(50);

        CookieCheater.justify("dragon", "AURA_SWAP",
            "Aura " + slot + " → " + this._auraName(auraId) +
            " (sold+rebuilt 50 " + target.name + ")");

        this._auraSwapping = false;
    },

    _auraName: function(id) {
        var names = {
            0: "None", 1: "Breath of Milk", 2: "Dragon Cursor",
            3: "Elder Battalion", 4: "Reaper of Fields", 5: "Earth Shatterer",
            6: "Master of the Armory", 7: "Fierce Hoarder", 8: "Dragon God",
            9: "Arcane Aura", 10: "Dragonflight", 11: "Radiant Appetite",
            12: "Dragon's Fortune", 13: "Dragon's Curve", 14: "Reality Bending",
            15: "Dragon Orbs", 16: "Supreme Intellect", 17: "Dragon Guts",
            18: "Dragon Heart"
        };
        return names[id] || "Aura " + id;
    }
};
