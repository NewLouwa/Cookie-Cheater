// Grimoire (Wizard Tower) minigame automation
// Casts "Force the Hand of Fate" when magic is full, ideally during Frenzy.
// Combo: Frenzy + FtHoF can produce Building Special or Click Frenzy = huge burst.

CookieCheater.modules.grimoire = {
    tick: function() {
        if (!CookieCheater.config.grimoire_enabled) return;
        if (!CookieCheater.throttle("grimoire", 5000)) return;

        var tower = Game.ObjectsById[7];
        if (!tower || !tower.minigame) return;
        var M = tower.minigame;

        var magic = M.magic;
        var maxMagic = M.magicM;
        if (maxMagic <= 0) return;

        // Wait until magic is at least 90% full
        if (magic < maxMagic * 0.9) return;

        // Find "Force the Hand of Fate" spell - try multiple lookup methods
        var spell = null;
        if (M.spells) {
            // Try exact keys the game uses
            spell = M.spells["hand of fate"] ||
                    M.spells["Hand of Fate"] ||
                    M.spells["force the hand of fate"];
        }
        // Fallback: search by name in spellsById
        if (!spell && M.spellsById) {
            for (var i = 0; i < M.spellsById.length; i++) {
                var s = M.spellsById[i];
                if (s && s.name && s.name.toLowerCase().indexOf("hand of fate") !== -1) {
                    spell = s;
                    break;
                }
            }
        }
        // Last resort: first spell (FtHoF is always index 0)
        if (!spell && M.spellsById && M.spellsById[0]) {
            spell = M.spellsById[0];
        }
        if (!spell) return;

        // Check spell cost
        var cost;
        try {
            cost = M.getSpellCost(spell);
        } catch(e) {
            cost = Math.floor(maxMagic * 0.6); // FtHoF costs ~60% of max magic
        }
        if (cost > magic) return;

        // Don't cast if golden cookie already on screen (avoid overlap/waste)
        for (var i = 0; i < Game.shimmers.length; i++) {
            if (Game.shimmers[i].type === "golden") return;
        }

        var hasFrenzy = CookieCheater.hasCpsBuff();

        // Best: cast during Frenzy for combo potential
        if (hasFrenzy) {
            try { M.castSpell(spell); } catch(e) {
                try { M.castSpell(spell, {force: true}); } catch(e2) {}
            }
            CookieCheater.log("grimoire", "cast", "Force the Hand of Fate (FRENZY COMBO!)");
            return;
        }

        // Cast if magic is completely full (don't waste regen)
        if (magic >= maxMagic) {
            try { M.castSpell(spell); } catch(e) {
                try { M.castSpell(spell, {force: true}); } catch(e2) {}
            }
            CookieCheater.log("grimoire", "cast", "Force the Hand of Fate (magic capped)");
        }
    }
};
