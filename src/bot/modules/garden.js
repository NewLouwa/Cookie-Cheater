// Garden minigame automation
// Plants optimal crops, auto-harvests mature plants, manages garden strategy.

CookieCheater.modules.garden = {
    tick: function() {
        if (!CookieCheater.config.garden_enabled) return;
        if (!CookieCheater.throttle("garden", 15000)) return; // Check every 15s

        var farm = Game.ObjectsById[2]; // Farm
        if (!farm || !farm.minigame) return;
        var M = farm.minigame;

        // Auto-harvest mature plants
        this._harvestMature(M);

        // Plant optimal crops in empty spots
        this._plantCrops(M);
    },

    _harvestMature: function(M) {
        for (var y = 0; y < 6; y++) {
            for (var x = 0; x < 6; x++) {
                var tile = M.plot[y][x];
                if (tile[0] <= 0) continue; // Empty

                var plant = M.plantsById[tile[0] - 1];
                if (!plant) continue;

                var age = tile[1];
                // Plants are mature when age >= 100 * plant.mature
                // They die at age 100
                // Harvest between mature and death
                if (age >= plant.mature * 100 && age < 100) {
                    M.harvest(x, y);
                    CookieCheater.log("garden", "harvest", plant.name + " at (" + x + "," + y + ")");
                }
            }
        }
    },

    _plantCrops: function(M) {
        // Only plant if we have seeds unlocked
        if (!M.plantsById || M.plantsById.length === 0) return;

        // Strategy: plant Baker's Wheat in all empty spots (always available, +1% CPS)
        // Later: Bakeberry for cookie bonus, Queenbeet for sugar lumps
        var plantId = -1;

        // Check for Bakeberry (better than Baker's Wheat)
        for (var i = 0; i < M.plantsById.length; i++) {
            var p = M.plantsById[i];
            if (p.name === "Bakeberry" && p.unlocked) {
                plantId = i;
                break;
            }
        }

        // Fallback to Baker's Wheat
        if (plantId < 0) {
            for (var i = 0; i < M.plantsById.length; i++) {
                var p = M.plantsById[i];
                if (p.name === "Baker's wheat" && p.unlocked) {
                    plantId = i;
                    break;
                }
            }
        }

        if (plantId < 0) return;

        // Plant in empty spots (respect garden size based on farm level)
        var size = M.plotLimits ? M.plotLimits[Math.min(farm.level, M.plotLimits.length - 1)] : [6, 6];
        var planted = 0;

        for (var y = 0; y < 6; y++) {
            for (var x = 0; x < 6; x++) {
                if (M.plot[y][x][0] > 0) continue; // Already occupied
                if (!M.isTileUnlocked(x, y)) continue;

                // Check if we can afford to plant (costs cookies)
                var plant = M.plantsById[plantId];
                var cost = plant.cost ? M.getCost(plant) : 0;
                if (cost > Game.cookies * 0.01) continue; // Don't spend more than 1% of cookies

                M.useTool(plantId, x, y);
                planted++;

                if (planted >= 3) return; // Plant a few per tick to not lag
            }
        }
    }
};
