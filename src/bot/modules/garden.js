// Garden minigame automation
// Plants optimal crops, auto-harvests mature plants, manages garden strategy.

CookieCheater.modules.garden = {
    tick: function() {
        if (!CookieCheater.config.garden_enabled) return;
        if (!CookieCheater.throttle("garden", 15000)) return;

        var farm = Game.ObjectsById[2]; // Farm
        if (!farm || !farm.minigame) return;
        var M = farm.minigame;

        this._harvestMature(M);
        this._plantCrops(M, farm);
    },

    _harvestMature: function(M) {
        if (!M.plot) return;
        var plotSize = M.plotLimits ? M.plotLimits.length : 6;
        for (var y = 0; y < 6; y++) {
            for (var x = 0; x < 6; x++) {
                var tile = M.plot[y][x];
                if (!tile || tile[0] <= 0) continue;

                var plant = M.plantsById[tile[0] - 1];
                if (!plant) continue;

                var age = tile[1];
                // In Cookie Clicker, age goes from 0 to 100.
                // plant.mature is a fraction (e.g. 0.3 means mature at age 30).
                // Harvest when mature but before death (age 100).
                var matureAge = plant.mature * 100;
                if (age >= matureAge && age <= 99) {
                    M.harvest(x, y);
                    CookieCheater.log("garden", "harvest", plant.name + " at (" + x + "," + y + ")");
                }
            }
        }
    },

    _plantCrops: function(M, farm) {
        if (!M.plantsById || M.plantsById.length === 0) return;
        if (M.freeze) return; // Don't plant while garden is frozen

        // Priority: Queenbeet (sugar lumps) > Bakeberry (cookies on harvest) > Baker's Wheat (always available)
        var plantId = this._findBestSeed(M);
        if (plantId < 0) return;

        var planted = 0;
        for (var y = 0; y < 6; y++) {
            for (var x = 0; x < 6; x++) {
                if (!M.plot[y] || !M.plot[y][x]) continue;
                if (M.plot[y][x][0] > 0) continue;
                if (!M.isTileUnlocked(x, y)) continue;

                var plant = M.plantsById[plantId];
                // getCost returns the cookie cost; plantId+1 because the game uses 1-indexed for tools
                try {
                    var cost = M.getCost(plant);
                    if (cost > Game.cookies * 0.01) continue;
                    M.useTool(plantId, x, y);
                    planted++;
                } catch(e) {
                    // useTool API might differ between versions
                    try { M.seedSelected = plantId; M.clickTile(x, y); } catch(e2) {}
                    planted++;
                }

                if (planted >= 3) return;
            }
        }
    },

    _findBestSeed: function(M) {
        // Check seeds in priority order
        var priorities = ["Queenbeet", "Bakeberry", "Baker's wheat"];
        for (var p = 0; p < priorities.length; p++) {
            for (var i = 0; i < M.plantsById.length; i++) {
                var plant = M.plantsById[i];
                if (plant && plant.unlocked && plant.name === priorities[p]) {
                    return i;
                }
            }
        }
        // Last resort: first unlocked seed
        for (var i = 0; i < M.plantsById.length; i++) {
            if (M.plantsById[i] && M.plantsById[i].unlocked) return i;
        }
        return -1;
    }
};
