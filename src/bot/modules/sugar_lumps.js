// Sugar Lump management
// Auto-harvests ripe sugar lumps and spends them on priority buildings.

CookieCheater.modules.sugarLumps = {
    tick: function() {
        if (!CookieCheater.config.auto_harvest_lumps) return;
        if (!CookieCheater.throttle("sugar_lumps", 30000)) return; // Check every 30s

        // Auto-harvest ripe lumps
        this._harvestRipeLump();

        // Spend lumps on priority buildings
        this._spendLumps();
    },

    _harvestRipeLump: function() {
        if (typeof Game.lumpT === "undefined") return;

        // A sugar lump ripens after ~20 hours, is ripe at 23h, falls at 24h
        // Game.lumpRipeAge = time to ripe (in ms)
        var now = Date.now();
        var lumpAge = now - Game.lumpT;
        var ripeAge = Game.lumpRipeAge || (23 * 60 * 60 * 1000);

        if (lumpAge >= ripeAge) {
            // Click the lump to harvest
            try {
                Game.clickLump();
                CookieCheater.log("sugar_lumps", "harvest", "Harvested ripe sugar lump");
            } catch(e) {
                // May not be available in all versions
            }
        }
    },

    _spendLumps: function() {
        if (!Game.lumps || Game.lumps < 1) return;

        // Keep a reserve of lumps (for Sugar Baking bonus: 1% per lump up to 100)
        var reserve = 100;
        if (Game.lumps <= reserve) return;

        // Spend priority: buildings that unlock/improve minigames
        var priorities = [
            { name: "Wizard tower", id: 7, reason: "more max magic" },
            { name: "Farm", id: 2, reason: "more garden plots" },
            { name: "Bank", id: 5, reason: "more stock slots" },
            { name: "Temple", id: 6, reason: "more spirit power" },
        ];

        for (var i = 0; i < priorities.length; i++) {
            var b = Game.ObjectsById[priorities[i].id];
            if (!b || b.locked) continue;

            // Level up if possible (costs 1 lump per level)
            if (b.level < 10 && Game.lumps > reserve) {
                try {
                    b.levelUp();
                    CookieCheater.log("sugar_lumps", "level_up", b.name + " to level " + b.level);
                    return; // One level-up per tick
                } catch(e) {}
            }
        }
    }
};
