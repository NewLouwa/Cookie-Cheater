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

    _setAuras: function() {
        try {
            // Aura 1: Radiant Appetite (11) = x2 CPS, best single aura
            // Fallback: Earth Shatterer (5) if Radiant not unlocked yet
            var wantedAura1 = 11; // Radiant Appetite
            var wantedAura2 = 1;  // Breath of Milk

            // Check what's available based on dragon level
            // Level 5+: can set aura 1
            // Level 21+: Radiant Appetite unlocked
            // Level 25: can set aura 2 (dual aura)
            if (Game.dragonLevel < 21) {
                wantedAura1 = 5; // Earth Shatterer until Radiant available
            }

            if (Game.dragonAura !== wantedAura1) {
                Game.dragonAura = wantedAura1;
                Game.recalculateGains = 1;
                CookieCheater.log("dragon", "aura1", "Set to " + this._auraName(wantedAura1));
            }

            // Second aura slot (level 25+)
            if (Game.dragonLevel >= 25 && typeof Game.dragonAura2 !== "undefined") {
                if (Game.dragonAura2 !== wantedAura2) {
                    Game.dragonAura2 = wantedAura2;
                    Game.recalculateGains = 1;
                    CookieCheater.log("dragon", "aura2", "Set to " + this._auraName(wantedAura2));
                }
            }
        } catch(e) {}
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
