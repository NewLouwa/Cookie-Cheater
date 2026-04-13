// ============================================================================
// DRAGON (Krumblor) — Auto-training + aura management
// ============================================================================
// Training: each level requires sacrificing 100 of a specific building type
//   Level 5-24: building = ObjectsById[level - 5]
//   Training via Game.UpgradeDragon() when cost is met
//
// Auras:
//   Default: Dragonflight (10) — x1111 click buff chance from golden cookies
//   Combo: swap to Radiant Appetite (11) = x2 CPS (costs 50 buildings to swap)
//   Dual (lv25+): Dragonflight + Radiant Appetite

CookieCheater.modules.dragon = {
    _auraSwapping: false,
    _lastLoggedLevel: -1,

    tick: function() {
        if (!CookieCheater.config.dragon_enabled) return;
        if (!CookieCheater.throttle("dragon", 5000)) return;

        if (typeof Game.dragonLevel === "undefined") return;

        this._trainDragon();
        if (Game.dragonLevel >= 5) this._setAuras();
    },

    _trainDragon: function() {
        // Buy "A crumbly egg" to start dragon
        var egg = Game.Upgrades["A crumbly egg"];
        if (egg && !egg.bought && egg.unlocked && egg.canBuy()) {
            egg.buy();
            CookieCheater.justify("dragon", "train", "Bought A crumbly egg — dragon training begins!");
            return;
        }

        if (Game.dragonLevel <= 0) return;
        if (Game.dragonLevel >= Game.dragonLevels.length - 1) return; // Max level

        // Check if we can afford the current training level
        var level = Game.dragonLevels[Game.dragonLevel];
        if (!level || !level.cost) return;

        var canAfford = false;
        try { canAfford = level.cost(); } catch(e) { return; }

        if (canAfford) {
            // Train! Uses Game.UpgradeDragon which handles the sacrifice
            try {
                Game.UpgradeDragon();
                CookieCheater.justify("dragon", "TRAIN",
                    "Dragon level " + Game.dragonLevel + "/" + (Game.dragonLevels.length - 1) +
                    " — " + (level.name || '') +
                    (Game.dragonLevel >= 21 ? " RADIANT APPETITE UNLOCKED!" : ""));
            } catch(e) {
                // Fallback: manual level up
                try {
                    level.buy();
                    Game.dragonLevel++;
                    Game.recalculateGains = 1;
                    CookieCheater.justify("dragon", "TRAIN",
                        "Dragon level " + Game.dragonLevel + " (manual)");
                } catch(e2) {}
            }
            return;
        }

        // Can't afford — log what's needed ONCE per level
        if (this._lastLoggedLevel !== Game.dragonLevel) {
            this._lastLoggedLevel = Game.dragonLevel;
            // Training costs: level 5-24 need 100 of building[level-5]
            var buildingIdx = Game.dragonLevel - 5;
            if (buildingIdx >= 0 && buildingIdx < Game.ObjectsById.length) {
                var b = Game.ObjectsById[buildingIdx];
                if (b && !b.locked) {
                    CookieCheater.log("dragon", "waiting",
                        "Need " + b.name + " x100 (have " + b.amount + ") for dragon level " + (Game.dragonLevel + 1));
                }
            }
        }
    },

    // Default aura: Dragonflight (10) — chance for x1111 click buff from golden cookies
    // During combo: swap to Radiant Appetite (11) = x2 CPS for max combo value
    // After combo: swap back to Dragonflight
    _setAuras: function() {
        try {
            var comboTier = CookieCheater._comboTier || 0;
            var wantedAura1, wantedAura2;

            if (comboTier >= 2) {
                wantedAura1 = 11; // Radiant Appetite during combo
                wantedAura2 = 1;  // Breath of Milk
            } else {
                wantedAura1 = 10; // Dragonflight default
                wantedAura2 = 11; // Radiant Appetite as secondary
            }

            if (Game.dragonLevel < 21) {
                wantedAura1 = 10; // Dragonflight
                wantedAura2 = 5;  // Earth Shatterer
            }

            if (Game.dragonAura !== wantedAura1) {
                this._swapAura(1, wantedAura1);
            }

            if (Game.dragonLevel >= 25 && typeof Game.dragonAura2 !== "undefined") {
                if (Game.dragonAura2 !== wantedAura2) {
                    this._swapAura(2, wantedAura2);
                }
            }
        } catch(e) {}
    },

    _swapAura: function(slot, auraId) {
        if (this._auraSwapping) return;
        this._auraSwapping = true;

        // Find cheapest building with 55+ to sell 50 for aura swap cost
        var target = null;
        for (var i = 0; i < Game.ObjectsById.length; i++) {
            var b = Game.ObjectsById[i];
            if (b.locked || b.amount < 55) continue;
            if (!target || b.price < target.price) target = b;
        }

        if (!target) { this._auraSwapping = false; return; }

        target.sell(50);
        if (slot === 1) Game.dragonAura = auraId;
        else Game.dragonAura2 = auraId;
        Game.recalculateGains = 1;
        target.buy(50);

        CookieCheater.justify("dragon", "AURA_SWAP",
            "Aura " + slot + " -> " + this._auraName(auraId) +
            " (sold+rebuilt 50 " + target.name + ")");

        this._auraSwapping = false;
    },

    _auraName: function(id) {
        var names = {
            0:"None", 1:"Breath of Milk", 2:"Dragon Cursor", 3:"Elder Battalion",
            4:"Reaper of Fields", 5:"Earth Shatterer", 6:"Master of Armory",
            7:"Fierce Hoarder", 8:"Dragon God", 9:"Arcane Aura", 10:"Dragonflight",
            11:"Radiant Appetite", 12:"Dragon's Fortune", 13:"Dragon's Curve",
            14:"Reality Bending", 15:"Dragon Orbs", 16:"Supreme Intellect",
            17:"Dragon Guts", 18:"Dragon Heart"
        };
        return names[id] || "Aura " + id;
    }
};
