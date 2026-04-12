// Grandmapocalypse management
// Controls Elder Pledge / Elder Covenant to balance golden cookies vs wrinklers.
// "pledge" mode: buy Elder Pledge every time it expires (peace for golden cookies)
// "covenant" mode: buy Elder Covenant (permanent peace, 5% CPS penalty)
// "full" mode: let the Grandmapocalypse run (wrinkler income)

CookieCheater.modules.grandmapocalypse = {
    tick: function() {
        // Only check every 5 seconds
        if (!CookieCheater.throttle("grandma", 5000)) return;

        var strategy = CookieCheater.config.grandmapocalypse_strategy;

        // elderWrath: 0=none, 1=appeasement, 2=awoken, 3=angered
        var wrath = Game.elderWrath;

        if (strategy === "pledge") {
            // Keep pledging to stay at elderWrath=0 for golden cookies
            if (wrath > 0) {
                // Find Elder Pledge upgrade
                var pledge = Game.Upgrades["Elder Pledge"];
                if (pledge && !pledge.bought && pledge.canBuy()) {
                    pledge.buy();
                    CookieCheater.log("grandmapocalypse", "pledge", "Bought Elder Pledge");
                }
            }
        } else if (strategy === "covenant") {
            // Buy Elder Covenant for permanent peace
            var covenant = Game.Upgrades["Elder Covenant"];
            if (covenant && !covenant.bought && covenant.canBuy() && covenant.unlocked) {
                covenant.buy();
                CookieCheater.log("grandmapocalypse", "covenant", "Bought Elder Covenant");
            }
            // Fall back to pledge if covenant not available yet
            if (wrath > 0 && (!covenant || !covenant.unlocked)) {
                var pledge = Game.Upgrades["Elder Pledge"];
                if (pledge && !pledge.bought && pledge.canBuy()) {
                    pledge.buy();
                    CookieCheater.log("grandmapocalypse", "pledge", "Bought Elder Pledge (covenant not yet available)");
                }
            }
        }
        // "full" mode: do nothing, let wrinklers feed
    }
};
