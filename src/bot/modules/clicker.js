// Auto-clicker with combo awareness
// Detects active buff combos and maximizes click value during windows.
// Combo types:
//   Frenzy (x7 CPS, 77s) + Click Frenzy (x777 click, 13s) = x5439 per click
//   Frenzy + Dragonflight (x1111 click) = x7777 per click
//   Frenzy + Building Special (variable, huge CPS burst)
//   Elder Frenzy (x666 CPS, 6s) - wrath cookie exclusive
//
// Strategy:
//   - Early game: always click (clicking is significant income)
//   - Mid game: click during buffs, light clicking otherwise
//   - Late game: only burst-click during combo windows

CookieCheater.modules.clicker = {
    _comboActive: false,

    tick: function() {
        if (!CookieCheater.config.auto_click) return;

        var combo = this._detectCombo();

        // Combo tiers — scaled response:
        //   tier 0: no buffs (score=1)
        //   tier 1: Frenzy x7 alone (score 2-20) — buy buildings+upgrades, skip Lucky bank, NO godzamok
        //   tier 2: Frenzy + Building Special, Elder Frenzy etc (score 21-499) — aggressive, godzamok small
        //   tier 3: Frenzy + Click Frenzy (score 500+) — full burst, max godzamok, pop wrinklers
        this._comboActive = combo.score > 1;
        this._comboTier = combo.score >= 500 ? 3 : combo.score >= 21 ? 2 : combo.score > 1 ? 1 : 0;

        // Expose combo state for other modules (Godzamok, etc.)
        CookieCheater._comboActive = this._comboActive;
        CookieCheater._comboScore = combo.score;
        CookieCheater._comboTier = this._comboTier;

        var phase = CookieCheater.getPhase();

        if (combo.hasClickBuff) {
            // COMBO WINDOW: burst click as fast as possible
            var clicks = CookieCheater.config.clicks_per_frame;
            for (var i = 0; i < clicks; i++) {
                Game.ClickCookie();
            }
            CookieCheater.stats.totalClicks += clicks;
            return;
        }

        if (combo.hasCpsBuff) {
            // CPS buff active (Frenzy/Elder Frenzy) - click moderately
            Game.ClickCookie();
            CookieCheater.stats.totalClicks++;
            return;
        }

        // No buff - decide based on phase
        if (phase === "early") {
            // Always click in early game
            Game.ClickCookie();
            CookieCheater.stats.totalClicks++;
        } else if (!CookieCheater.config.click_only_during_buffs) {
            // Light clicking if config allows
            Game.ClickCookie();
            CookieCheater.stats.totalClicks++;
        }
    },

    _detectCombo: function() {
        var hasClickBuff = false;
        var hasCpsBuff = false;
        var cpsMult = 1;
        var clickMult = 1;
        var buffCount = 0;

        for (var name in Game.buffs) {
            var buff = Game.buffs[name];
            if (buff.multClick && buff.multClick > 1) {
                hasClickBuff = true;
                clickMult *= buff.multClick;
            }
            if (buff.multCpS && buff.multCpS > 1) {
                hasCpsBuff = true;
                cpsMult *= buff.multCpS;
            }
            buffCount++;
        }

        return {
            hasClickBuff: hasClickBuff,
            hasCpsBuff: hasCpsBuff,
            cpsMult: cpsMult,
            clickMult: clickMult,
            score: cpsMult * clickMult,
            buffCount: buffCount
        };
    }
};
