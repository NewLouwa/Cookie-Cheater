// Pantheon minigame automation
// Manages spirit slots for optimal bonuses.
// Diamond slot: Mokalsium (milk bonus) for passive, Godzamok (sell bonus) for combos
// Ruby slot: Muridal (cursor bonus) or Vomitrax (golden cookie duration)
// Jade slot: Jeremy (building bonus)

CookieCheater.modules.pantheon = {
    tick: function() {
        if (!CookieCheater.config.pantheon_enabled) return;
        if (!CookieCheater.throttle("pantheon", 30000)) return; // Check every 30s

        var temple = Game.ObjectsById[6]; // Temple
        if (!temple || !temple.minigame) return;
        var M = temple.minigame;

        // Spirit IDs vary by game version - find them by name
        var spirits = M.gods;
        if (!spirits) return;

        // Find useful spirits
        var mokalsium = null; // "Mother Spirit" - milk multiplier
        var muridal = null;   // "Spirit of Labor" - clicking bonus
        var jeremy = null;    // "Spirit of Industry" - building CPS

        for (var key in spirits) {
            var s = spirits[key];
            if (s.name.indexOf("Mother") !== -1 || key === "asceticism") mokalsium = s;
            if (s.name.indexOf("Labor") !== -1 || key === "labor") muridal = s;
            if (s.name.indexOf("Industry") !== -1 || key === "industry") jeremy = s;
        }

        // Set Diamond slot (slot 0) to Mokalsium for passive play
        if (mokalsium && M.slot[0] !== mokalsium.id) {
            try {
                M.slotGod(mokalsium, 0);
                CookieCheater.log("pantheon", "slot", "Set Diamond to " + mokalsium.name);
            } catch(e) {}
        }

        // Set Ruby slot (slot 1) to Muridal
        if (muridal && M.slot[1] !== muridal.id) {
            try {
                M.slotGod(muridal, 1);
                CookieCheater.log("pantheon", "slot", "Set Ruby to " + muridal.name);
            } catch(e) {}
        }

        // Set Jade slot (slot 2) to Jeremy
        if (jeremy && M.slot[2] !== jeremy.id) {
            try {
                M.slotGod(jeremy, 2);
                CookieCheater.log("pantheon", "slot", "Set Jade to " + jeremy.name);
            } catch(e) {}
        }
    }
};
