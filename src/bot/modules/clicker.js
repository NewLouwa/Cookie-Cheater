// Auto-clicker module
// Clicks the big cookie. In early game, clicks every frame.
// Once CPS dominates, only clicks during buff windows (Frenzy + Click Frenzy combos).

CookieCheater.modules.clicker = {
    tick: function() {
        if (!CookieCheater.config.auto_click) return;

        var hasClickBuff = CookieCheater.hasClickBuff();
        var hasCpsBuff = CookieCheater.hasCpsBuff();
        var phase = CookieCheater.getPhase();

        // In early game, always click (clicking is significant income)
        // Later, only click during buff windows unless config says always
        var shouldClick = false;

        if (phase === "early") {
            shouldClick = true;
        } else if (CookieCheater.config.click_only_during_buffs) {
            shouldClick = hasClickBuff || hasCpsBuff;
        } else {
            shouldClick = true;
        }

        if (shouldClick) {
            Game.ClickCookie();
            CookieCheater.stats.totalClicks++;

            // Burst click during click buff combos for maximum value
            if (hasClickBuff) {
                var extra = CookieCheater.config.clicks_per_frame - 1;
                for (var i = 0; i < extra; i++) {
                    Game.ClickCookie();
                    CookieCheater.stats.totalClicks++;
                }
            }
        }
    }
};
