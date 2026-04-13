// ============================================================================
// GARDEN - Comprehensive planner with tile tracking, mutation strategy,
//          growth monitoring, soil management, and harvest optimization
// ============================================================================
//
// MUTATION RULES (from wiki):
// - Mutations check ALL 8 neighbors (orthogonal + diagonal) in 3x3 around empty tile
// - Both parents must be MATURE (age >= plant.mature, where mature is 0-100)
// - Same species can be both parents (e.g. 2x Baker's Wheat -> Thumbcorn 5%)
// - Chance is per empty tile per tick, multiplied by soil (Wood Chips = 3x)
// - New plant appears in the empty tile adjacent to BOTH parents
//
// PHASES:
// 1. wheat_fill:  Only Baker's Wheat unlocked. Fill all tiles. Fertilizer soil.
// 2. mutating:    Plant parent combos to discover new seeds. Wood Chips soil (3x mutations).
// 3. bakeberry:   Farm Bakeberry on Clay (+25% eff). Harvest for cookies + upgrade drops.
// 4. queenbeet:   Queenbeet ring for Juicy Queenbeet (sugar lumps). Wood Chips.
// 5. sacrifice:   All 34 seeds found. Offer to sacrifice for 10 lumps.

CookieCheater.modules.garden = {
    _phase: "init",
    _lastSoilChange: 0,
    _tileGoals: {},     // { "x,y": { goal: "mutation_parent|farming|ring", seed: "name", targetChild: "name" } }
    _gardenState: null, // Exposed to dashboard

    tick: function() {
        if (!CookieCheater.config.garden_enabled) return;
        if (!CookieCheater.throttle("garden", 8000)) return;

        var farm = Game.ObjectsById[2];
        if (!farm || !farm.minigame) return;
        var M = farm.minigame;
        if (!M.plot) return;

        this._phase = this._detectPhase(M);
        this._reserveForPlanting(M);
        this._scanGarden(M);
        this._harvestMature(M);

        switch (this._phase) {
            case "wheat_fill":  this._executeWheatFill(M); break;
            case "mutating":    this._executeMutationPlan(M); break;
            case "bakeberry":   this._executeFarming(M, "Bakeberry"); break;
            case "queenbeet":   this._executeQueenbeetRing(M); break;
            case "sacrifice":   this._trySacrifice(M); break;
        }

        this._manageSoil(M, farm);
        this._exposeState(M, farm);
    },

    // ============================
    // GARDEN SCANNER
    // ============================
    _scanGarden: function(M) {
        // Build a snapshot of every tile for the dashboard and decision-making
        var tiles = [];
        for (var y = 0; y < 6; y++) {
            for (var x = 0; x < 6; x++) {
                if (!M.isTileUnlocked(x, y)) continue;
                var tile = M.plot[y][x];
                var info = { x: x, y: y, empty: tile[0] === 0 };
                if (!info.empty) {
                    var plant = M.plantsById[tile[0] - 1];
                    info.plant = plant ? plant.name : "?";
                    info.plantIcon = plant ? (plant.icon || 0) : 0;
                    info.age = tile[1];
                    info.mature = plant ? (tile[1] >= (plant.mature || 50)) : false;
                    info.matureAge = plant ? Math.round((plant.mature || 50)) : 50;
                    info.pct = Math.round(tile[1]);
                }
                var key = x + "," + y;
                info.goal = this._tileGoals[key] || null;
                tiles.push(info);
            }
        }
        this._gardenState = { tiles: tiles, phase: this._phase };
    },

    // ============================
    // PHASE DETECTION
    // ============================
    _detectPhase: function(M) {
        var unlocked = this._getUnlockedSeeds(M);
        var count = unlocked.length;

        if (count >= 34) return "sacrifice";
        if (this._hasSeed(M, "Queenbeet") && count > 25) return "queenbeet";
        if (this._hasSeed(M, "Bakeberry")) return "bakeberry";
        if (count > 1) return "mutating";
        return "wheat_fill";
    },

    // ============================
    // HARVEST LOGIC
    // ============================
    _harvestMature: function(M) {
        var KB = CookieCheater.KB;
        for (var y = 0; y < 6; y++) {
            for (var x = 0; x < 6; x++) {
                if (!M.isTileUnlocked(x, y)) continue;
                var tile = M.plot[y][x];
                if (!tile || tile[0] <= 0) continue;

                var plant = M.plantsById[tile[0] - 1];
                if (!plant) continue;
                var age = tile[1];
                var matureAge = (plant.mature || 50);

                // NEVER harvest mutation parents — they need to stay mature for mutations!
                var key = x + "," + y;
                var goal = this._tileGoals[key];
                if (goal && goal.goal === "mutation_parent") continue;

                // Even without a goal tag, if we're in mutating phase,
                // don't harvest any plant that's a parent for the current mutation target
                if (this._phase === "mutating") {
                    var nextMut = this._getNextMutationTarget(M);
                    if (nextMut && (plant.name === nextMut.parents[0] || plant.name === nextMut.parents[1])) {
                        continue; // Keep this parent alive for mutations!
                    }
                }

                // Crumbspore/Doughshroom: let die naturally (explode into cookies)
                if (plant.name === "Crumbspore" || plant.name === "Doughshroom") continue;

                // Meddleweed: harvest immediately (contaminates neighbors)
                if (plant.name === "Meddleweed") {
                    M.harvest(x, y);
                    CookieCheater.justify("garden", "WEED", "Removed Meddleweed at (" + x + "," + y + ") — prevents contamination");
                    continue;
                }

                // Harvest mature plants
                if (age >= matureAge && age <= 99) {
                    // Don't harvest Nursetulip (provides ongoing bonus to neighbors)
                    if (plant.name === "Nursetulip") continue;
                    // Don't harvest Elderwort (immortal, provides ongoing bonus)
                    if (plant.name === "Elderwort" && goal && goal.goal !== "farming") continue;

                    M.harvest(x, y);
                    var drop = KB && KB.garden && KB.garden.upgradeDrops[plant.name];
                    if (drop) {
                        CookieCheater.justify("garden", "HARVEST",
                            plant.name + " (" + x + "," + y + ") — " + (drop.chance * 100) + "% chance: " + drop.upgrade + " (" + drop.effect + ")");
                    } else {
                        CookieCheater.log("garden", "harvest", plant.name + " (" + x + "," + y + ") mature at " + Math.round(age) + "%");
                    }
                }
            }
        }
    },

    // ============================
    // PHASE 1: WHEAT FILL
    // ============================
    _executeWheatFill: function(M) {
        var wheatId = this._findSeed(M, "Baker's wheat");
        if (wheatId < 0) return;
        this._fillEmptyTiles(M, wheatId, "farming");
    },

    // ============================
    // PHASE 2: MUTATION PLANNING
    // ============================
    _executeMutationPlan: function(M) {
        if (!CookieCheater.KB || !CookieCheater.KB.garden) return;
        var mutations = CookieCheater.KB.garden.mutationPath;

        // Find the first mutation we haven't unlocked yet and have parents for
        var target = null;
        for (var m = 0; m < mutations.length; m++) {
            var mut = mutations[m];
            if (this._hasSeed(M, mut.child)) continue;
            var id1 = this._findSeed(M, mut.parents[0]);
            var id2 = this._findSeed(M, mut.parents[1]);
            if (id1 < 0 || id2 < 0) continue;
            target = { mut: mut, id1: id1, id2: id2 };
            break;
        }

        if (!target) {
            // No mutations possible with current seeds — fill with wheat/bakeberry for CPS
            this._executeFarming(M, this._hasSeed(M, "Bakeberry") ? "Bakeberry" : "Baker's wheat");
            return;
        }

        // Plan the mutation layout based on grid size and parent types
        var sameSeed = (target.id1 === target.id2);
        this._tileGoals = {};

        // Get all unlocked tiles
        var allTiles = [];
        for (var y = 0; y < 6; y++) {
            for (var x = 0; x < 6; x++) {
                if (M.isTileUnlocked(x, y)) allTiles.push({x: x, y: y});
            }
        }

        var parentName1 = target.mut.parents[0];
        var parentName2 = target.mut.parents[1];

        // First pass: check if ALL tiles are full (no room for mutations)
        var emptyCount = 0;
        for (var i = 0; i < allTiles.length; i++) {
            if (M.plot[allTiles[i].y][allTiles[i].x][0] === 0) emptyCount++;
        }

        // If no empty tiles, harvest some plants to make room for mutations
        if (emptyCount === 0 && allTiles.length >= 4) {
            var harvested = 0;
            for (var i = 0; i < allTiles.length; i++) {
                var t = allTiles[i];
                // Harvest every 3rd tile to create mutation targets
                var pos = (t.x - allTiles[0].x) + (t.y - allTiles[0].y) * 3;
                if (pos % 3 === 1) { // Same pattern as "empty" below
                    M.harvest(t.x, t.y);
                    harvested++;
                }
            }
            if (harvested > 0) {
                CookieCheater.justify("garden", "CLEAR_FOR_MUTATION",
                    "Harvested " + harvested + " plants to make room for " + target.mut.child + " mutations");
            }
        }

        // Tag existing plants that are correct parents
        for (var i = 0; i < allTiles.length; i++) {
            var t = allTiles[i];
            var tile = M.plot[t.y][t.x];
            if (tile[0] > 0) {
                var plant = M.plantsById[tile[0] - 1];
                if (plant && (plant.name === parentName1 || plant.name === parentName2)) {
                    this._tileGoals[t.x + "," + t.y] = {
                        goal: "mutation_parent",
                        seed: plant.name,
                        targetChild: target.mut.child
                    };
                }
            }
        }

        // For SAME parent (e.g. 2x wheat): checkerboard, leave gaps for mutations
        // For DIFFERENT parents: interleave A-B, ensure empty tiles touch both
        var planted = 0;

        if (sameSeed) {
            // Checkerboard: plant on even (x+y), leave odd for mutations
            for (var i = 0; i < allTiles.length; i++) {
                var t = allTiles[i];
                if (M.plot[t.y][t.x][0] > 0) continue; // Already has something

                if ((t.x + t.y) % 2 === 0) {
                    if (this._tryPlant(M, target.id1, t.x, t.y)) {
                        this._tileGoals[t.x + "," + t.y] = { goal: "mutation_parent", seed: parentName1, targetChild: target.mut.child };
                        planted++;
                    }
                } else {
                    this._tileGoals[t.x + "," + t.y] = { goal: "mutation_target", seed: null, targetChild: target.mut.child };
                }
            }
        } else {
            // Different parents: for small grids, use explicit optimal pattern
            // Goal: every empty tile must be adjacent to at least 1 of parent A AND 1 of parent B
            //
            // For any grid: alternate rows of A and B, leaving middle row empty
            // Row pattern: A _ B _ A _ (for 6-wide) or A B _ (for 3-wide)
            // This guarantees empty tiles are sandwiched between A and B rows

            // Strategy: plant parents with GAPS for mutations to appear
            // Rule: at least 1/3 of tiles must be empty targets
            // Each empty tile must be adjacent to at least one A and one B
            for (var i = 0; i < allTiles.length; i++) {
                var t = allTiles[i];
                if (M.plot[t.y][t.x][0] > 0) continue;

                // Use modulo 3 pattern for ALL grid sizes
                // This guarantees 1/3 empty, 1/3 parent A, 1/3 parent B
                var pos = (t.x - allTiles[0].x) + (t.y - allTiles[0].y) * 3;
                var role;
                if (pos % 3 === 0) role = "A";
                else if (pos % 3 === 1) role = "empty"; // EMPTY in the middle!
                else role = "B";

                if (role === "A") {
                    if (this._tryPlant(M, target.id1, t.x, t.y)) {
                        this._tileGoals[t.x + "," + t.y] = { goal: "mutation_parent", seed: parentName1, targetChild: target.mut.child };
                        planted++;
                    }
                } else if (role === "B") {
                    if (this._tryPlant(M, target.id2, t.x, t.y)) {
                        this._tileGoals[t.x + "," + t.y] = { goal: "mutation_parent", seed: parentName2, targetChild: target.mut.child };
                        planted++;
                    }
                } else {
                    this._tileGoals[t.x + "," + t.y] = { goal: "mutation_target", seed: null, targetChild: target.mut.child };
                }
            }
        }

        if (planted > 0) {
            var chanceStr = target.mut.chance >= 0.01 ? (target.mut.chance * 100) + "%" : (target.mut.chance * 100).toFixed(2) + "%";
            CookieCheater.justify("garden", "MUTATION_PLAN",
                "Planted " + planted + "x " + target.mut.parents[0] +
                (sameSeed ? "" : " + " + target.mut.parents[1]) +
                " for " + target.mut.child + " (" + chanceStr + "/tick per empty neighbor)" +
                (M.soil === 4 ? " [Wood Chips: 3x mutation rate!]" : ""));
        }
    },

    // ============================
    // PHASE 3: BAKEBERRY/DUKETATER FARMING
    // ============================
    _executeFarming: function(M, seedName) {
        var seedId = this._findSeed(M, seedName);
        if (seedId < 0) {
            seedId = this._findSeed(M, "Baker's wheat");
            seedName = "Baker's wheat";
        }
        if (seedId < 0) return;
        this._fillEmptyTiles(M, seedId, "farming");
    },

    // ============================
    // PHASE 4: QUEENBEET RING
    // ============================
    _executeQueenbeetRing: function(M) {
        // Plant 8 Queenbeet surrounding center tile for Juicy Queenbeet mutation (0.1% per tick)
        // Juicy Queenbeet = +1 sugar lump on harvest. Very valuable.
        var qId = this._findSeed(M, "Queenbeet");
        if (qId < 0) return;

        // Find best center tile (most unlocked neighbors)
        var bestCenter = null, bestCount = 0;
        for (var cy = 1; cy < 5; cy++) {
            for (var cx = 1; cx < 5; cx++) {
                if (!M.isTileUnlocked(cx, cy)) continue;
                var count = 0;
                for (var dy = -1; dy <= 1; dy++) {
                    for (var dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        if (M.isTileUnlocked(cx + dx, cy + dy)) count++;
                    }
                }
                if (count > bestCount) { bestCount = count; bestCenter = { x: cx, y: cy }; }
            }
        }
        if (!bestCenter || bestCount < 4) return; // Need at least 4 neighbors

        this._tileGoals = {};
        // Mark center as mutation target
        this._tileGoals[bestCenter.x + "," + bestCenter.y] = {
            goal: "mutation_target", seed: null, targetChild: "Juicy queenbeet"
        };

        // Plant Queenbeet in all 8 neighbors
        var planted = 0;
        for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                var nx = bestCenter.x + dx, ny = bestCenter.y + dy;
                if (!M.isTileUnlocked(nx, ny)) continue;
                if (M.plot[ny][nx][0] > 0) {
                    // Already has a plant — check if it's Queenbeet
                    var existing = M.plantsById[M.plot[ny][nx][0] - 1];
                    if (existing && existing.name === "Queenbeet") {
                        this._tileGoals[nx + "," + ny] = { goal: "mutation_parent", seed: "Queenbeet", targetChild: "Juicy queenbeet" };
                        continue;
                    }
                    continue; // Something else, don't overwrite
                }
                if (this._tryPlant(M, qId, nx, ny)) {
                    this._tileGoals[nx + "," + ny] = { goal: "mutation_parent", seed: "Queenbeet", targetChild: "Juicy queenbeet" };
                    planted++;
                }
            }
        }

        if (planted > 0) {
            CookieCheater.justify("garden", "QUEENBEET_RING",
                planted + " Queenbeet planted around (" + bestCenter.x + "," + bestCenter.y + ") — " +
                "0.1%/tick for Juicy Queenbeet (+1 sugar lump on harvest)" +
                (M.soil === 4 ? " [Wood Chips: 0.3%/tick!]" : ""));
        }
    },

    // ============================
    // PHASE 5: SACRIFICE
    // ============================
    _trySacrifice: function(M) {
        CookieCheater.justify("garden", "SACRIFICE_READY",
            "All 34 seeds discovered! Sacrifice garden for 10 sugar lumps + achievement. Use dashboard to trigger.");
    },

    // ============================
    // SOIL MANAGEMENT
    // ============================
    _manageSoil: function(M, farm) {
        if (Date.now() - this._lastSoilChange < 60000) return;

        var targetSoil = 0; // Dirt default
        switch (this._phase) {
            case "wheat_fill":  targetSoil = 1; break; // Fertilizer (fast growth)
            case "mutating":    targetSoil = (farm.amount >= 300) ? 4 : (farm.amount >= 50 ? 1 : 0); break; // Wood Chips if 300+ farms, else Fertilizer
            case "bakeberry":   targetSoil = (farm.amount >= 100) ? 2 : 0; break; // Clay (slow growth = longer mature = more harvests)
            case "queenbeet":   targetSoil = (farm.amount >= 300) ? 4 : 0; break; // Wood Chips (3x mutation for JQB)
        }

        if (M.soil !== targetSoil) {
            try {
                M.soil = targetSoil;
                this._lastSoilChange = Date.now();
                var names = ["Dirt", "Fertilizer", "Clay", "Pebbles", "Wood Chips"];
                CookieCheater.justify("garden", "SOIL",
                    "Switched to " + (names[targetSoil] || "Dirt") + " for " + this._phase + " phase" +
                    (targetSoil === 4 ? " (3x mutation rate!)" : targetSoil === 2 ? " (+25% plant efficiency)" : targetSoil === 1 ? " (faster growth)" : ""));
            } catch (e) {}
        }
    },

    // ============================
    // COOKIE RESERVATION
    // ============================
    _reserveForPlanting: function(M) {
        var emptyTiles = this._getEmptyUnlockedTiles(M).length;
        if (emptyTiles === 0) { CookieCheater._gardenReserve = 0; return; }

        var seedId;
        switch (this._phase) {
            case "queenbeet": seedId = this._findSeed(M, "Queenbeet"); break;
            case "bakeberry": seedId = this._findSeed(M, "Bakeberry"); break;
            default: seedId = this._findSeed(M, "Baker's wheat"); break;
        }
        if (seedId < 0) seedId = this._findSeed(M, "Baker's wheat");
        if (seedId < 0) { CookieCheater._gardenReserve = 0; return; }

        var costPerSeed = M.getCost(M.plantsById[seedId]);
        CookieCheater._gardenReserve = costPerSeed * Math.min(emptyTiles, 6); // Reserve for up to 6 plantings
    },

    // ============================
    // EXPOSE STATE TO DASHBOARD
    // ============================
    _exposeState: function(M, farm) {
        var unlocked = this._getUnlockedSeeds(M);
        var nextMut = this._getNextMutationTarget(M);
        var soilNames = ["Dirt", "Fertilizer", "Clay", "Pebbles", "Wood Chips"];
        var soilName = soilNames[M.soil] || "?";

        // Build strategy explanation
        var strat = this._buildStrategyExplanation(M, farm, unlocked, nextMut, soilName);

        CookieCheater._gardenInfo = {
            phase: this._phase,
            soil: soilName,
            seedsUnlocked: unlocked.length,
            seedsTotal: M.plantsById.length,
            seeds: unlocked,
            tiles: this._gardenState ? this._gardenState.tiles : [],
            tileGoals: this._tileGoals,
            farmLevel: farm.level || 0,
            nextMutation: nextMut,
            strategy: strat,
            plantIcons: this._getPlantIconMap(M),
        };
    },

    _buildStrategyExplanation: function(M, farm, unlocked, nextMut, soilName) {
        var s = {};
        var emptyTiles = this._getEmptyUnlockedTiles(M).length;
        var totalTiles = 0;
        for (var y = 0; y < 6; y++)
            for (var x = 0; x < 6; x++)
                if (M.isTileUnlocked(x, y)) totalTiles++;

        // Current goal
        switch (this._phase) {
            case "wheat_fill":
                s.goal = "Fill garden with Baker's Wheat";
                s.why = "Only seed available. Each wheat gives +1% CPS. Filling all " + totalTiles + " tiles for passive boost.";
                s.nextStep = emptyTiles > 0
                    ? "Planting " + emptyTiles + " more wheat (need " + CookieCheater.modules.purchaser._fmt(CookieCheater._gardenReserve || 0) + " cookies)"
                    : "All tiles planted. Waiting for wheat to mature, then harvest for +1% CPS each.";
                s.soilReason = "Fertilizer: faster tick speed (3 min vs 5) so wheat grows quicker.";
                break;

            case "mutating":
                s.goal = "Discover new seeds via mutation";
                if (nextMut) {
                    s.why = "Trying to breed " + nextMut.child + " by planting " + nextMut.parents[0] +
                        (nextMut.parents[0] === nextMut.parents[1] ? " (x2)" : " + " + nextMut.parents[1]) +
                        " next to each other. " + (nextMut.chance * 100) + "% chance per empty neighbor per tick.";
                    s.nextStep = "Waiting for both parents to MATURE (growth bar must be full). " +
                        "Once mature, every adjacent empty tile has a " + (nextMut.chance * 100) + "% chance " +
                        (M.soil === 4 ? "(x3 with Wood Chips = " + (nextMut.chance * 300) + "%!) " : "") +
                        "each game tick to spawn " + nextMut.child + ".";
                } else {
                    s.why = "Looking for mutation recipes we can attempt with current seeds.";
                    s.nextStep = "No viable mutation found with current seeds. Farming for CPS instead.";
                }
                s.soilReason = farm.amount >= 300
                    ? "Wood Chips: 3x mutation rate! Best soil for discovering new seeds."
                    : farm.amount >= 50
                        ? "Fertilizer: faster growth until we have 300 farms for Wood Chips."
                        : "Dirt: need more farms to unlock better soils.";
                break;

            case "bakeberry":
                s.goal = "Farm Bakeberry for cookies + permanent upgrades";
                s.why = "Bakeberry gives +1% CPS while growing. Harvesting mature Bakeberry gives +30 min of CPS (max 3% bank). " +
                    "Also 1.5% chance to drop 'Bakeberry Cookies' permanent upgrade (+2% CPS forever).";
                s.nextStep = emptyTiles > 0
                    ? "Planting " + emptyTiles + " more Bakeberry."
                    : "All tiles planted. Watching growth — will harvest when mature for cookie payout.";
                s.soilReason = "Clay: +25% plant efficiency and slower growth means longer mature window for better harvests.";
                break;

            case "queenbeet":
                s.goal = "Breed Juicy Queenbeet for sugar lumps";
                s.why = "8 Queenbeet in a ring pattern. When all 8 are mature, center tile has 0.1% chance per tick " +
                    (M.soil === 4 ? "(x3 with Wood Chips = 0.3%!) " : "") +
                    "to spawn Juicy Queenbeet. Harvesting it gives +1 sugar lump!";
                var matureRing = 0, totalRing = 0;
                for (var key in this._tileGoals) {
                    var g = this._tileGoals[key];
                    if (g.goal === "mutation_parent") {
                        totalRing++;
                        var parts = key.split(",");
                        var tx = parseInt(parts[0]), ty = parseInt(parts[1]);
                        if (M.plot[ty] && M.plot[ty][tx] && M.plot[ty][tx][0] > 0) {
                            var plant = M.plantsById[M.plot[ty][tx][0] - 1];
                            if (plant && M.plot[ty][tx][1] >= (plant.mature || 50)) matureRing++;
                        }
                    }
                }
                s.nextStep = matureRing >= totalRing && totalRing > 0
                    ? "All " + totalRing + " Queenbeet are MATURE! Waiting for Juicy Queenbeet mutation..."
                    : matureRing + "/" + totalRing + " Queenbeet mature. Waiting for the rest to grow.";
                s.soilReason = "Wood Chips: 3x mutation rate for maximum Juicy Queenbeet chance.";
                break;

            case "sacrifice":
                s.goal = "Garden sacrifice available!";
                s.why = "All 34 seeds discovered. Sacrificing destroys all plants and seeds (except Baker's Wheat) " +
                    "but gives 10 sugar lumps + 'Seedless to nay' achievement (5% cheaper seeds, 5% faster maturity, 5% more upgrade drops).";
                s.nextStep = "Click Sacrifice in the game garden panel when ready. Can be repeated.";
                s.soilReason = "N/A";
                break;

            default:
                s.goal = "Initializing...";
                s.why = "Waiting for garden data.";
                s.nextStep = "Will start planting shortly.";
                s.soilReason = "";
        }

        // Upcoming mutations roadmap
        s.roadmap = [];
        if (CookieCheater.KB && CookieCheater.KB.garden) {
            var mutations = CookieCheater.KB.garden.mutationPath;
            for (var m = 0; m < mutations.length; m++) {
                var mut = mutations[m];
                var has = this._hasSeed(M, mut.child);
                var canDo = !has && this._findSeed(M, mut.parents[0]) >= 0 && this._findSeed(M, mut.parents[1]) >= 0;
                s.roadmap.push({
                    child: mut.child,
                    parents: mut.parents,
                    chance: mut.chance,
                    unlocked: has,
                    available: canDo,
                });
            }
        }

        return s;
    },

    // Map plant names to icon IDs for the dashboard
    _getPlantIconMap: function(M) {
        var map = {};
        for (var i = 0; i < M.plantsById.length; i++) {
            var p = M.plantsById[i];
            if (p) map[p.name] = p.icon || i;
        }
        return map;
    },

    _getNextMutationTarget: function(M) {
        if (!CookieCheater.KB || !CookieCheater.KB.garden) return null;
        var mutations = CookieCheater.KB.garden.mutationPath;
        for (var m = 0; m < mutations.length; m++) {
            var mut = mutations[m];
            if (this._hasSeed(M, mut.child)) continue;
            if (this._findSeed(M, mut.parents[0]) < 0) continue;
            if (this._findSeed(M, mut.parents[1]) < 0) continue;
            return { child: mut.child, parents: mut.parents, chance: mut.chance };
        }
        return null;
    },

    // ============================
    // HELPERS
    // ============================
    _tryPlant: function(M, seedId, x, y) {
        if (!M.canPlant(M.plantsById[seedId])) return false;
        try {
            var result = M.useTool(seedId, x, y);
            return result === true;
        } catch (e) {
            try { M.seedSelected = seedId; M.clickTile(x, y); return true; } catch (e2) {}
        }
        return false;
    },

    _fillEmptyTiles: function(M, seedId, goalType) {
        var planted = 0;
        for (var y = 0; y < 6; y++) {
            for (var x = 0; x < 6; x++) {
                if (!M.isTileUnlocked(x, y)) continue;
                if (M.plot[y][x][0] > 0) continue;
                if (this._tryPlant(M, seedId, x, y)) {
                    this._tileGoals[x + "," + y] = { goal: goalType, seed: M.plantsById[seedId].name };
                    planted++;
                }
                if (planted >= 6) return planted;
            }
        }
        return planted;
    },

    _getEmptyUnlockedTiles: function(M) {
        var tiles = [];
        for (var y = 0; y < 6; y++) {
            for (var x = 0; x < 6; x++) {
                if (M.isTileUnlocked(x, y) && M.plot[y][x][0] === 0) tiles.push({ x: x, y: y });
            }
        }
        return tiles;
    },

    _getUnlockedSeeds: function(M) {
        var seeds = [];
        for (var i = 0; i < M.plantsById.length; i++) {
            if (M.plantsById[i] && M.plantsById[i].unlocked) seeds.push(M.plantsById[i].name);
        }
        return seeds;
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
