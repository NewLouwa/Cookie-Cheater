// Golden Cookie and Reindeer shimmer handler
// Pops golden cookies and reindeer instantly every frame.

CookieCheater.modules.shimmer = {
    tick: function() {
        if (!Game.shimmers || Game.shimmers.length === 0) return;

        for (var i = Game.shimmers.length - 1; i >= 0; i--) {
            var s = Game.shimmers[i];

            if (s.type === "golden" && CookieCheater.config.auto_pop_golden) {
                s.pop();
                CookieCheater.stats.goldenCookiesClicked++;
                CookieCheater.log("shimmer", "golden_cookie", "Popped golden cookie");
            }

            if (s.type === "reindeer" && CookieCheater.config.auto_pop_reindeer) {
                s.pop();
                CookieCheater.log("shimmer", "reindeer", "Popped reindeer");
            }
        }
    }
};
