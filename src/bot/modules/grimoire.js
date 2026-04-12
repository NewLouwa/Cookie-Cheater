// Grimoire (Wizard Tower) minigame automation
// Casts "Force the Hand of Fate" when magic is full, ideally during Frenzy.

CookieCheater.modules.grimoire = {
    tick: function() {
        if (!CookieCheater.config.grimoire_enabled) return;
        if (!CookieCheater.throttle("grimoire", 5000)) return; // Check every 5s

        var tower = Game.ObjectsById[7]; // Wizard Tower
        if (!tower || !tower.minigame) return;
        var M = tower.minigame;

        var magic = M.magic;
        var maxMagic = M.magicM;

        // Wait until magic is at least 90% full
        if (magic < maxMagic * 0.9) return;

        // "Force the Hand of Fate" is spell index 0 (usually)
        // It summons a golden cookie (or wrath cookie on backfire)
        var spell = M.spells["hand of fate"] || M.spellsById[0];
        if (!spell) return;

        // Get the spell cost
        var cost = M.getSpellCost(spell);
        if (cost > magic) return;

        // Best combo: cast during Frenzy for a chance at Building Special or Click Frenzy
        var hasFrenzy = CookieCheater.hasCpsBuff();

        // Don't cast if there's already a golden cookie on screen
        // (would reduce the cookie's value or cause overlap)
        var goldenOnScreen = false;
        for (var i = 0; i < Game.shimmers.length; i++) {
            if (Game.shimmers[i].type === "golden") {
                goldenOnScreen = true;
                break;
            }
        }

        // Cast if: magic full AND (Frenzy active OR magic is 100% full and no Frenzy for a while)
        if (hasFrenzy && !goldenOnScreen) {
            M.castSpell(spell);
            CookieCheater.log("grimoire", "cast", "Force the Hand of Fate (during Frenzy!)");
        } else if (magic >= maxMagic && !goldenOnScreen) {
            // Magic is capped, cast anyway to not waste regeneration
            M.castSpell(spell);
            CookieCheater.log("grimoire", "cast", "Force the Hand of Fate (magic full)");
        }
    }
};
