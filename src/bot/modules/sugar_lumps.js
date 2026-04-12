// ============================================================================
// SUGAR LUMPS - Harvest + smart spending with USER APPROVAL
// ============================================================================
// Auto-harvests ripe lumps.
// Ranks top 3 spending options based on current game state.
// Pushes proposal to CookieCheater._lumpProposal for dashboard display.
// NEVER spends lumps without user clicking "Approve" in the dashboard.

CookieCheater.modules.sugarLumps = {
    tick: function() {
        if (!CookieCheater.config.auto_harvest_lumps) return;
        if (!CookieCheater.throttle("sugar_lumps", 30000)) return;

        this._harvestRipeLump();
        this._generateProposal();
    },

    _harvestRipeLump: function() {
        if (typeof Game.lumpT === "undefined") return;

        var now = Date.now();
        var lumpAge = now - Game.lumpT;
        var ripeAge = Game.lumpRipeAge || (23 * 60 * 60 * 1000);

        if (lumpAge >= ripeAge) {
            try {
                Game.clickLump();
                CookieCheater.justify("sugar_lumps", "HARVEST",
                    "Harvested ripe sugar lump (age " + Math.round(lumpAge / 3600000) + "h)");
            } catch(e) {}
        }
    },

    _generateProposal: function() {
        var lumps = Game.lumps || 0;
        var KB = CookieCheater.KB;
        var reserve = KB && KB.sugarLumps ? KB.sugarLumps.reserve : 100;

        // Not enough lumps to spend? Clear proposal.
        if (lumps <= reserve) {
            CookieCheater._lumpProposal = null;
            return;
        }

        // If user already has an active approved action pending, skip
        if (CookieCheater._lumpApproved) return;

        var available = lumps - reserve;
        var options = [];

        // Score every building that can be leveled up
        var minigameIds = [2, 5, 6, 7]; // Farm, Bank, Temple, Wizard Tower

        for (var i = 0; i < Game.ObjectsById.length; i++) {
            var b = Game.ObjectsById[i];
            if (b.locked || b.amount === 0) continue;

            var level = b.level || 0;
            if (level >= 10) continue; // Max level

            var score = 0;
            var benefit = "";
            var why = "";

            if (KB && KB.sugarLumps) {
                score = KB.sugarLumps.scoreLevelUp(i, level);

                // Get benefit description
                if (KB.sugarLumps.levelBenefits[i]) {
                    try { benefit = KB.sugarLumps.levelBenefits[i](level); } catch(e) { benefit = "Level " + level + " -> " + (level+1); }
                } else {
                    benefit = b.name + " lv" + level + " -> " + (level+1);
                }

                // Minigame unlock explanation
                if (level === 0 && KB.sugarLumps.minigameUnlocks[i]) {
                    var mg = KB.sugarLumps.minigameUnlocks[i];
                    why = "UNLOCKS " + mg.name + " minigame! " + mg.why;
                } else if (i === 2) {
                    why = benefit + ". More plots = more mutations & farming.";
                } else if (i === 7) {
                    why = benefit + ". More magic = more spell casts between regen.";
                } else if (i === 5) {
                    why = benefit + ". Marginal stock market improvement.";
                } else if (i === 6) {
                    why = "Temple lv" + level + " -> " + (level+1) + ". Spirit effects slightly stronger.";
                } else {
                    why = b.name + " lv" + level + " -> " + (level+1) + ". +1% CPS for this building.";
                }
            } else {
                // No KB, basic scoring
                score = minigameIds.indexOf(i) >= 0 ? (level === 0 ? 1000 : 50) : 5;
                benefit = b.name + " lv" + level + " -> " + (level+1);
                why = "Level up " + b.name;
            }

            if (score > 0) {
                options.push({
                    buildingId: i,
                    buildingName: b.name,
                    currentLevel: level,
                    targetLevel: level + 1,
                    score: score,
                    benefit: benefit,
                    why: why,
                    cost: 1, // Sugar lumps cost 1 per level
                });
            }
        }

        // Sort by score descending, take top 3
        options.sort(function(a, b) { return b.score - a.score; });
        var top3 = options.slice(0, 3);

        if (top3.length === 0) {
            CookieCheater._lumpProposal = null;
            return;
        }

        CookieCheater._lumpProposal = {
            lumps: lumps,
            available: available,
            reserve: reserve,
            options: top3,
            generatedAt: Date.now(),
        };
    },

    // Called by the API when user approves an option
    executeApproval: function(choiceIndex) {
        var proposal = CookieCheater._lumpProposal;
        if (!proposal || !proposal.options[choiceIndex]) return false;

        var choice = proposal.options[choiceIndex];
        var b = Game.ObjectsById[choice.buildingId];
        if (!b) return false;

        var lumps = Game.lumps || 0;
        if (lumps < 1) return false;

        try {
            b.levelUp();
            CookieCheater.justify("sugar_lumps", "LEVEL_UP",
                choice.buildingName + " lv" + choice.currentLevel + " -> " + choice.targetLevel +
                " (user approved) — " + choice.why);
            CookieCheater._lumpProposal = null;
            return true;
        } catch(e) {
            return false;
        }
    }
};
