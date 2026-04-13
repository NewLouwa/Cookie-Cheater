// ============================================================================
// WRINKLER MANAGEMENT
// ============================================================================
// Normal: let wrinklers feed, pop when all slots full + min time passed
// COMBO: pop ALL wrinklers immediately for massive cookie burst!
//   Wrinklers return 1.1x what they ate. During a x5000+ combo,
//   those returned cookies get multiplied by the combo. Popping
//   wrinklers during Click Frenzy = enormous burst.
// Shiny: NEVER pop (3.3x return, keep feeding forever)

CookieCheater.modules.wrinklers = {
    _lastPopTime: 0,
    _lastComboPopTime: 0,

    tick: function() {
        if (!CookieCheater.config.pop_wrinklers) return;
        if (!Game.wrinklers) return;
        if (!CookieCheater.throttle("wrinklers", 3000)) return;

        var feeding = [];
        var shinyIdx = -1;
        var totalSucked = 0;

        for (var i = 0; i < Game.wrinklers.length; i++) {
            var w = Game.wrinklers[i];
            if (w.phase === 2) {
                feeding.push(i);
                totalSucked += w.sucpicd;
                if (w.type === 1) shinyIdx = i;
            }
        }

        if (feeding.length === 0) return;

        // === COMBO POP ===
        // During tier 2+ combo (Frenzy + Click Frenzy), pop all wrinklers
        // The returned cookies benefit from the active combo multiplier
        // Only pop once per combo (don't re-pop immediately after they respawn)
        var comboTier = CookieCheater._comboTier || 0;
        if (comboTier >= 2 && totalSucked > 0 && Date.now() - this._lastComboPopTime > 30000) {
            var popped = 0;
            var payout = 0;
            for (var i = 0; i < feeding.length; i++) {
                var w = Game.wrinklers[feeding[i]];
                if (w.type === 1) continue; // Keep shiny
                payout += w.sucpicd * 1.1;
                w.hp = 0;
                popped++;
            }
            if (popped > 0) {
                this._lastComboPopTime = Date.now();
                var comboMult = CookieCheater._comboScore || 1;
                CookieCheater.justify("wrinklers", "COMBO_POP",
                    "Popped " + popped + " wrinklers during x" + Math.round(comboMult) + " combo! " +
                    "Payout ~" + CookieCheater.modules.purchaser._fmt(payout) +
                    " (effectively x" + Math.round(comboMult) + " = " +
                    CookieCheater.modules.purchaser._fmt(payout * comboMult) + ")");
            }
            return;
        }

        // === NORMAL POP ===
        // Pop when all slots full AND enough time has passed
        var maxSlots = 10;
        try { maxSlots = Game.getWrinklersMax ? Game.getWrinklersMax() : 10; } catch(e) {}

        var minFeedTime = CookieCheater.config.wrinkler_min_feed_minutes * 60 * 1000;
        var timeSinceLastPop = Date.now() - this._lastPopTime;

        if (feeding.length >= maxSlots && timeSinceLastPop >= minFeedTime) {
            var popped = 0;
            var expectedPayout = 0;

            for (var i = 0; i < feeding.length; i++) {
                var w = Game.wrinklers[feeding[i]];
                if (w.type === 1) continue; // Keep shiny
                expectedPayout += w.sucpicd * 1.1;
                w.hp = 0;
                popped++;
            }

            if (popped === 0) return;
            this._lastPopTime = Date.now();
            var shinyKept = feeding.length - popped;
            CookieCheater.justify("wrinklers", "POP",
                popped + " wrinklers popped" + (shinyKept > 0 ? " (kept " + shinyKept + " shiny)" : "") +
                " | payout ~" + CookieCheater.modules.purchaser._fmt(expectedPayout));
        }
    }
};
