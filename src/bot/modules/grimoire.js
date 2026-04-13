// ============================================================================
// GRIMOIRE - Spell casting with wiki-accurate mechanics
// ============================================================================
// Priority 1: Force the Hand of Fate during Frenzy (combo potential)
// Priority 2: Conjure Baked Goods when idle (free ~30min CPS)
// Priority 3: Hold magic if Frenzy expected soon
//
// Max magic: floor(4 + T^0.6 + 15*ln(1 + T + 10*(L-1)/15))
// FtHoF cost: 10 + 60% of max magic
// Conjure cost: 2 + 40% of max magic
// Spells are DETERMINISTIC based on save seed + total casts

CookieCheater.modules.grimoire = {
    _lastCastTime: 0,

    tick: function() {
        if (!CookieCheater.config.grimoire_enabled) return;
        if (!CookieCheater.throttle("grimoire", 3000)) return;

        var tower = Game.ObjectsById[7];
        if (!tower || !tower.minigame) return;
        var M = tower.minigame;

        var magic = M.magic;
        var maxMagic = M.magicM;
        if (maxMagic <= 0) return;

        // Expose magic state for dashboard
        CookieCheater._grimoire = {
            magic: Math.round(magic * 10) / 10,
            maxMagic: maxMagic,
            pct: Math.round(magic / maxMagic * 100),
            towerCount: tower.amount,
            towerLevel: tower.level || 1,
        };

        var hasFrenzy = CookieCheater.hasCpsBuff();
        var hasClickBuff = CookieCheater.hasClickBuff();
        var goldenOnScreen = this._goldenOnScreen();

        // === PRIORITY 1: FtHoF during Frenzy ===
        if (hasFrenzy && !goldenOnScreen) {
            var ftHoF = this._findSpell(M, "hand of fate");
            if (ftHoF) {
                var cost = this._spellCost(M, ftHoF);
                if (magic >= cost) {
                    this._cast(M, ftHoF);
                    CookieCheater.justify("grimoire", "FTHOF_COMBO",
                        "Cast Force the Hand of Fate during Frenzy (x" + this._getCpsMult() + ")! High chance of Click Frenzy = x5,439+ combo");
                    return;
                }
            }
        }

        // === PRIORITY 2: Conjure Baked Goods when idle ===
        if (!hasFrenzy && !hasClickBuff && magic >= maxMagic * 0.95) {
            var conjure = this._findSpell(M, "conjure");
            if (conjure) {
                var cost = this._spellCost(M, conjure);
                if (magic >= cost) {
                    // Only conjure if magic is nearly full (don't waste regen)
                    this._cast(M, conjure);
                    var payout = Game.cookiesPs * 1800; // ~30min CPS
                    CookieCheater.justify("grimoire", "CONJURE",
                        "Cast Conjure Baked Goods (no buffs active) — ~" +
                        CookieCheater.modules.strategist._fmt(payout) + " free cookies");
                    return;
                }
            }
        }

        // === PRIORITY 3: FtHoF when magic is completely full (don't waste regen) ===
        if (magic >= maxMagic && !goldenOnScreen) {
            var ftHoF = this._findSpell(M, "hand of fate");
            if (ftHoF) {
                var cost = this._spellCost(M, ftHoF);
                if (magic >= cost) {
                    this._cast(M, ftHoF);
                    CookieCheater.justify("grimoire", "FTHOF_FULL",
                        "Cast Force the Hand of Fate (magic capped at " + maxMagic + ", don't waste regen)");
                    return;
                }
            }

            // Can't afford FtHoF? Cast Conjure instead
            var conjure = this._findSpell(M, "conjure");
            if (conjure) {
                var cost = this._spellCost(M, conjure);
                if (magic >= cost) {
                    this._cast(M, conjure);
                    CookieCheater.justify("grimoire", "CONJURE_OVERFLOW",
                        "Cast Conjure Baked Goods (can't afford FtHoF, magic capped)");
                }
            }
        }
    },

    _findSpell: function(M, key) {
        // Try multiple lookup methods
        if (M.spells) {
            if (M.spells["hand of fate"] && key === "hand of fate") return M.spells["hand of fate"];
            if (M.spells["conjure baked goods"] && key === "conjure") return M.spells["conjure baked goods"];
            for (var k in M.spells) {
                if (k.toLowerCase().indexOf(key) !== -1) return M.spells[k];
            }
        }
        if (M.spellsById) {
            if (key === "hand of fate") return M.spellsById[1] || M.spellsById[0]; // FtHoF is usually index 1 or 0
            if (key === "conjure") return M.spellsById[0] || M.spellsById[1]; // Conjure is usually index 0 or 1
        }
        return null;
    },

    _spellCost: function(M, spell) {
        try { return M.getSpellCost(spell); } catch(e) {}
        return M.magicM; // Fallback: assume full cost
    },

    _cast: function(M, spell) {
        try { M.castSpell(spell); } catch(e) {
            try { M.castSpell(spell, {force: true}); } catch(e2) {}
        }
        this._lastCastTime = Date.now();
    },

    _goldenOnScreen: function() {
        for (var i = 0; i < Game.shimmers.length; i++) {
            if (Game.shimmers[i].type === "golden") return true;
        }
        return false;
    },

    _getCpsMult: function() {
        // Only count POSITIVE CPS buffs (not loan penalties or Clot)
        var mult = 1;
        for (var name in Game.buffs) {
            var m = Game.buffs[name].multCpS;
            if (m && m > 1) mult *= m; // Only multiply buffs, not debuffs
        }
        return mult;
    }
};
