// ============================================================================
// GARDEN - Full mutation/soil/harvest/sacrifice management
// ============================================================================
// Phase 1: Fill with Baker's Wheat on Fertilizer (fast CPS boost)
// Phase 2: Switch to Wood Chips, plant mutation combos to discover new seeds
// Phase 3: Farm Bakeberry on Clay (harvest for cookies + permanent upgrade drops)
// Phase 4: Queenbeet ring for Juicy Queenbeet (sugar lumps)
// Phase 5: Sacrifice when all 34 seeds found (10 lumps + achievement)

CookieCheater.modules.garden = {
    _phase: "init",
    _lastSoilChange: 0,

    tick: function() {
        if (!CookieCheater.config.garden_enabled) return;
        if (!CookieCheater.throttle("garden", 10000)) return;

        var farm = Game.ObjectsById[2];
        if (!farm || !farm.minigame) return;
        var M = farm.minigame;
        if (!M.plot) return;

        // Determine phase
        this._phase = this._detectPhase(M);

        // Auto-harvest mature plants (always)
        this._harvestMature(M);

        // Phase-specific planting
        switch (this._phase) {
            case "wheat_fill":   this._plantFill(M, farm, "Baker's wheat"); break;
            case "mutating":     this._plantMutations(M, farm); break;
            case "bakeberry":    this._plantFill(M, farm, "Bakeberry"); break;
            case "queenbeet":    this._plantQueenbeetRing(M, farm); break;
            case "sacrifice":    this._trySacrifice(M); break;
        }

        // Auto-manage soil
        this._manageSoil(M, farm);
    },

    _detectPhase: function(M) {
        var unlockedCount = 0;
        var hasBakeberry = false, hasQueenbeet = false;
        for (var i = 0; i < M.plantsById.length; i++) {
            var p = M.plantsById[i];
            if (p && p.unlocked) {
                unlockedCount++;
                if (p.name === "Bakeberry") hasBakeberry = true;
                if (p.name === "Queenbeet") hasQueenbeet = true;
            }
        }

        // All seeds found? Sacrifice!
        if (unlockedCount >= 34) return "sacrifice";
        // Have Queenbeet? Farm for Juicy Queenbeet (sugar lumps)
        if (hasQueenbeet && unlockedCount > 25) return "queenbeet";
        // Have Bakeberry? Farm it for cookies + upgrade drops
        if (hasBakeberry) return "bakeberry";
        // Still discovering seeds? Mutate!
        if (unlockedCount > 1) return "mutating";
        // Start: just plant wheat
        return "wheat_fill";
    },

    _harvestMature: function(M) {
        var KB = CookieCheater.KB;
        for (var y = 0; y < 6; y++) {
            for (var x = 0; x < 6; x++) {
                if (!M.plot[y] || !M.plot[y][x]) continue;
                var tile = M.plot[y][x];
                if (tile[0] <= 0) continue;

                var plant = M.plantsById[tile[0] - 1];
                if (!plant) continue;
                var age = tile[1];
                var matureAge = (plant.mature || 0.5) * 100;

                // Crumbspore/Doughshroom: let them die naturally (explode into cookies)
                if (plant.name === "Crumbspore" || plant.name === "Doughshroom") continue;

                // Meddleweed: harvest immediately (contaminates neighbors)
                if (plant.name === "Meddleweed" && age > 0) {
                    M.harvest(x, y);
                    continue;
                }

                // Harvest when mature
                if (age >= matureAge && age <= 99) {
                    M.harvest(x, y);
                    // Check if this plant drops a permanent upgrade
                    var drop = KB && KB.garden && KB.garden.upgradeDrops[plant.name];
                    if (drop) {
                        CookieCheater.justify("garden", "HARVEST",
                            plant.name + " (" + x + "," + y + ") — " + (drop.chance*100) + "% chance of " + drop.upgrade + " (" + drop.effect + ")");
                    } else {
                        CookieCheater.log("garden", "harvest", plant.name + " (" + x + "," + y + ")");
                    }
                }
            }
        }
    },

    _plantFill: function(M, farm, seedName) {
        var plantId = this._findSeed(M, seedName);
        if (plantId < 0) { plantId = this._findSeed(M, "Baker's wheat"); }
        if (plantId < 0) return;

        var planted = 0;
        for (var y = 0; y < 6; y++) {
            for (var x = 0; x < 6; x++) {
                if (!M.plot[y] || !M.plot[y][x] || M.plot[y][x][0] > 0) continue;
                if (!M.isTileUnlocked(x, y)) continue;

                var plant = M.plantsById[plantId];
                try {
                    var cost = M.getCost(plant);
                    // canPlant checks cookies >= cost. If we can't afford it, skip.
                    if (!M.canPlant(plant)) continue;
                    M.useTool(plantId, x, y);
                    planted++;
                } catch(e) {
                    try { M.seedSelected = plantId; M.clickTile(x, y); planted++; } catch(e2) {}
                }
                if (planted >= 5) return;
            }
        }
    },

    _plantMutations: function(M, farm) {
        if (!CookieCheater.KB || !CookieCheater.KB.garden) return;
        var mutations = CookieCheater.KB.garden.mutationPath;

        // Find the first mutation we haven't unlocked yet
        for (var m = 0; m < mutations.length; m++) {
            var mut = mutations[m];
            // Already have this plant?
            if (this._hasSeed(M, mut.child)) continue;

            // Have both parents?
            var id1 = this._findSeed(M, mut.parents[0]);
            var id2 = this._findSeed(M, mut.parents[1]);
            if (id1 < 0 || id2 < 0) continue;

            // Plant parents in checkerboard pattern for maximum adjacency
            this._plantMutationPattern(M, id1, id2);
            CookieCheater.justify("garden", "MUTATING",
                "Planting " + mut.parents[0] + " + " + mut.parents[1] +
                " for " + mut.child + " (" + (mut.chance * 100) + "% per tick)");
            return;
        }

        // No mutations to pursue - fall back to Bakeberry/wheat fill
        this._plantFill(M, farm, "Bakeberry");
    },

    _plantMutationPattern: function(M, seedA, seedB) {
        // Plant A and B in alternating tiles so they're always adjacent
        var planted = 0;
        for (var y = 0; y < 6; y++) {
            for (var x = 0; x < 6; x++) {
                if (!M.plot[y] || !M.plot[y][x] || M.plot[y][x][0] > 0) continue;
                if (!M.isTileUnlocked(x, y)) continue;

                var seed = ((x + y) % 2 === 0) ? seedA : seedB;
                try {
                    var cost = M.getCost(M.plantsById[seed]);
                    // canPlant checks cookies >= cost. If we can't afford it, skip.
                    if (!M.canPlant(plant)) continue;
                    M.useTool(seed, x, y);
                    planted++;
                } catch(e) {
                    try { M.seedSelected = seed; M.clickTile(x, y); planted++; } catch(e2) {}
                }
                if (planted >= 6) return;
            }
        }
    },

    _plantQueenbeetRing: function(M, farm) {
        // Plant 8 Queenbeet in a ring around a center tile for Juicy Queenbeet mutation
        // Pattern: all 8 neighbors of center (2,2) or (3,3) if garden is big enough
        var qId = this._findSeed(M, "Queenbeet");
        if (qId < 0) return;

        var cx = 3, cy = 3; // Center of 6x6 grid
        var ring = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        var planted = 0;

        for (var r = 0; r < ring.length; r++) {
            var x = cx + ring[r][0], y = cy + ring[r][1];
            if (x < 0 || x > 5 || y < 0 || y > 5) continue;
            if (!M.plot[y] || !M.plot[y][x] || M.plot[y][x][0] > 0) continue;
            if (!M.isTileUnlocked(x, y)) continue;

            try {
                var cost = M.getCost(M.plantsById[qId]);
                if (!M.canPlant(M.plantsById[qId])) continue;
                M.useTool(qId, x, y);
                planted++;
            } catch(e) {}
        }

        if (planted > 0) {
            CookieCheater.justify("garden", "QUEENBEET_RING",
                "Planted " + planted + " Queenbeet around center — 0.1% per tick for Juicy Queenbeet (+1 sugar lump on harvest)");
        }
    },

    _trySacrifice: function(M) {
        // All 34 seeds discovered — sacrifice for 10 lumps + achievement
        // Only do this once per session (or when user requests)
        if (!M.conversions) return; // sacrifice API may not exist
        CookieCheater.justify("garden", "SACRIFICE_READY",
            "All 34 seeds discovered! Garden sacrifice available: lose all seeds, gain 10 sugar lumps + Seedless to nay achievement. Use dashboard to trigger.");
        // Don't auto-sacrifice — let user decide via dashboard
    },

    _manageSoil: function(M, farm) {
        if (Date.now() - this._lastSoilChange < 60000) return; // 1 min cooldown

        var targetSoil;
        switch (this._phase) {
            case "mutating":    targetSoil = 4; break; // Wood Chips (3x mutations)
            case "bakeberry":   targetSoil = 2; break; // Clay (+25% efficiency)
            case "wheat_fill":  targetSoil = 1; break; // Fertilizer (fast growth)
            case "queenbeet":   targetSoil = 4; break; // Wood Chips (3x mutations for JQB)
            default:            targetSoil = 0; break; // Dirt
        }

        // Check if we have enough farms for the target soil
        var KB = CookieCheater.KB;
        if (KB && KB.garden && KB.garden.soils) {
            var soilNames = ["dirt", "fertilizer", "clay", "pebbles", "woodChips"];
            var soilData = KB.garden.soils[soilNames[targetSoil]];
            if (soilData && soilData.farmsNeeded && farm.amount < soilData.farmsNeeded) {
                targetSoil = 0; // Not enough farms, use dirt
            }
        }

        if (M.soil !== targetSoil) {
            try {
                M.soil = targetSoil;
                this._lastSoilChange = Date.now();
                var names = ["Dirt", "Fertilizer", "Clay", "Pebbles", "Wood Chips"];
                CookieCheater.justify("garden", "SOIL",
                    "Switched to " + names[targetSoil] + " for " + this._phase + " phase");
            } catch(e) {}
        }
    },

    _findSeed: function(M, name) {
        for (var i = 0; i < M.plantsById.length; i++) {
            if (M.plantsById[i] && M.plantsById[i].unlocked && M.plantsById[i].name === name) return i;
        }
        return -1;
    },

    _hasSeed: function(M, name) {
        return this._findSeed(M, name) >= 0;
    }
};
