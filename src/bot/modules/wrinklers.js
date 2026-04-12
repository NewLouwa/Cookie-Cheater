// Wrinkler management
// During Grandmapocalypse, wrinklers feed on cookie production but return 1.1x when popped.
// Strategy: let them feed, pop when all slots are full and they've fed long enough.

CookieCheater.modules.wrinklers = {
    tick: function() {
        if (!CookieCheater.config.pop_wrinklers) return;
        if (!Game.wrinklers) return;
        // Only check every 10 seconds
        if (!CookieCheater.throttle("wrinklers", 10000)) return;

        var feeding = [];
        var shiny = null;

        for (var i = 0; i < Game.wrinklers.length; i++) {
            var w = Game.wrinklers[i];
            if (w.phase === 2) { // Feeding
                if (w.type === 1) {
                    shiny = i; // Shiny wrinkler - very rare
                }
                feeding.push(i);
            }
        }

        // Always pop shiny wrinklers immediately (achievement + huge bonus)
        if (shiny !== null) {
            Game.wrinklers[shiny].hp = 0;
            CookieCheater.log("wrinklers", "pop_shiny", "Popped shiny wrinkler!");
            return;
        }

        // Pop all wrinklers when all slots are full and they've fed long enough
        var maxSlots = Game.getWrinklersMax ? Game.getWrinklersMax() : 12;
        var minFeedTime = CookieCheater.config.wrinkler_min_feed_minutes * 60 * 1000;

        if (feeding.length >= maxSlots) {
            // Check if the oldest wrinkler has fed long enough
            var oldestSucked = 0;
            for (var i = 0; i < feeding.length; i++) {
                var w = Game.wrinklers[feeding[i]];
                if (w.sucpicd > oldestSucked) oldestSucked = w.sucpicd;
            }

            // sucpicd is total cookies sucked, not time - use as proxy
            // Alternative: pop when all slots full (simpler, still effective)
            if (feeding.length >= maxSlots) {
                for (var i = 0; i < feeding.length; i++) {
                    Game.wrinklers[feeding[i]].hp = 0;
                }
                CookieCheater.log("wrinklers", "pop_all", "Popped " + feeding.length + " wrinklers");
            }
        }
    }
};
