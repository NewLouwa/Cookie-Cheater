// ============================================================================
// SHIMMER HANDLER — Golden cookies, wrath cookies, and reindeer
// ============================================================================
// During normal play: pop all golden cookies (always beneficial)
// During Grandmapocalypse: golden cookies become WRATH cookies
//   Wrath cookie outcomes:
//     GOOD: Elder Frenzy (x666 CPS 6s), Lucky, Click Frenzy
//     BAD:  Clot (x0.5 CPS 66s), Ruin (lose cookies), Cursed Finger
//
// Strategy based on grandmapocalypse_strategy config:
//   "pledge" mode: bot keeps Elder Pledge active, so all cookies are golden (safe to pop)
//   "covenant" mode: same — Elder Covenant active, golden cookies only
//   "full" mode: wrath cookies appear — pop them anyway (Elder Frenzy is worth the risk)
//
// During ACTIVE COMBO (Frenzy etc): ALWAYS pop — even wrath can give Click Frenzy
// Reindeer: ALWAYS pop (only appear during Christmas, always beneficial)

CookieCheater.modules.shimmer = {
    tick: function() {
        if (!Game.shimmers || Game.shimmers.length === 0) return;

        for (var i = Game.shimmers.length - 1; i >= 0; i--) {
            var s = Game.shimmers[i];

            if (s.type === "golden") {
                if (!CookieCheater.config.auto_pop_golden) continue;

                var isWrath = s.wrath > 0;
                var elderWrath = Game.elderWrath || 0;
                var strategy = CookieCheater.config.grandmapocalypse_strategy;
                var hasBuff = CookieCheater.hasCpsBuff() || CookieCheater.hasClickBuff();

                if (!isWrath) {
                    // Normal golden cookie — always pop
                    s.pop();
                    CookieCheater.stats.goldenCookiesClicked++;
                    CookieCheater.log("shimmer", "golden", "Popped golden cookie");
                } else {
                    // Wrath cookie — decide based on strategy
                    if (strategy === "full") {
                        // Full Grandmapocalypse: pop wrath cookies
                        // Elder Frenzy (x666 CPS) is worth the risk of Clot/Ruin
                        // During active buff: definitely pop (combo potential)
                        s.pop();
                        CookieCheater.stats.goldenCookiesClicked++;
                        CookieCheater.justify("shimmer", "WRATH",
                            "Popped wrath cookie (full Grandmapocalypse mode)" +
                            (hasBuff ? " — combo potential!" : " — risk of Clot/Ruin, reward of Elder Frenzy x666"));
                    } else if (hasBuff) {
                        // Pledge/covenant mode but we have an active buff
                        // Pop for combo potential (Click Frenzy can still appear)
                        s.pop();
                        CookieCheater.stats.goldenCookiesClicked++;
                        CookieCheater.justify("shimmer", "WRATH_COMBO",
                            "Popped wrath cookie during active buff — combo chance!");
                    } else {
                        // Pledge/covenant mode, no buff — skip wrath cookies
                        // The pledge should prevent wrath cookies, but if one slips through:
                        CookieCheater.justify("shimmer", "WRATH_SKIP",
                            "Skipped wrath cookie (pledge mode, no active buff — risk > reward)");
                    }
                }
            }

            if (s.type === "reindeer" && CookieCheater.config.auto_pop_reindeer) {
                s.pop();
                CookieCheater.log("shimmer", "reindeer", "Popped reindeer");
            }
        }
    }
};
