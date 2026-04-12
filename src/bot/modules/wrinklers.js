// Wrinkler management with correct game mechanics
//
// Mechanics:
//   - Each wrinkler drains 5% of CPS (but this is multiplicative with returns)
//   - Normal wrinkler returns 1.1x what it ate
//   - Shiny wrinkler returns 3.3x what it ate (1/10000 spawn chance)
//   - With 10 wrinklers: they drain 50% CPS but return 550% of drained cookies
//   - Net multiplier with N wrinklers: (1 - 0.05*N) + N * 0.05 * 1.1 = positive above 0
//   - Quadratic scaling: more wrinklers = exponentially more profit
//
// Strategy:
//   - Let all slots fill, then let them feed for maximum time
//   - Pop all at once (more efficient than one-by-one)
//   - Always pop shiny wrinklers immediately (very rare + 3x multiplier)
//   - During Grandmapocalypse, wrinklers are the PRIMARY income source

CookieCheater.modules.wrinklers = {
    _lastPopTime: 0,

    tick: function() {
        if (!CookieCheater.config.pop_wrinklers) return;
        if (!Game.wrinklers) return;
        if (!CookieCheater.throttle("wrinklers", 10000)) return;

        var feeding = [];
        var shinyIdx = -1;
        var totalSucked = 0;

        for (var i = 0; i < Game.wrinklers.length; i++) {
            var w = Game.wrinklers[i];
            if (w.phase === 2) { // Feeding
                feeding.push(i);
                totalSucked += w.sucpicd; // Total cookies sucked by this wrinkler
                if (w.type === 1) shinyIdx = i; // Shiny!
            }
        }

        // NEVER pop shiny wrinklers in bulk - they return 3.3x instead of 1.1x
        // Keep them feeding as long as possible, they're 3x more valuable

        if (feeding.length === 0) return;

        // Get max slots (base 10, +2 Elder Spice, +2 Dragon Guts aura)
        var maxSlots = 10;
        try { maxSlots = Game.getWrinklersMax ? Game.getWrinklersMax() : 10; } catch(e) {}

        // Pop when: all slots full AND enough time has passed
        var minFeedTime = CookieCheater.config.wrinkler_min_feed_minutes * 60 * 1000;
        var timeSinceLastPop = Date.now() - this._lastPopTime;

        if (feeding.length >= maxSlots && timeSinceLastPop >= minFeedTime) {
            // Pop normal wrinklers only - keep shiny ones (3.3x return)
            var popped = 0;
            var expectedPayout = 0;

            for (var i = 0; i < feeding.length; i++) {
                var w = Game.wrinklers[feeding[i]];
                if (w.type === 1) {
                    // Shiny wrinkler - KEEP IT, it's 3x more valuable
                    continue;
                }
                expectedPayout += w.sucpicd * 1.1;
                w.hp = 0;
                popped++;
            }

            if (popped === 0) return; // All were shiny, nothing to pop
            this._lastPopTime = Date.now();
            var shinyKept = feeding.length - popped;
            CookieCheater.log("wrinklers", "POP",
                popped + " popped" + (shinyKept > 0 ? " (kept " + shinyKept + " shiny)" : "") +
                " | payout~" + CookieCheater.modules.purchaser._fmt(expectedPayout));
        }
    }
};
