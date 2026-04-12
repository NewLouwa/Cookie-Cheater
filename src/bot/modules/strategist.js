// ============================================================================
// STRATEGIST - The brain of the bot
// ============================================================================
// Maintains a comprehensive game state analysis, sets priorities,
// plans short-term and long-term goals, and justifies every action.
//
// Other modules read CookieCheater.strategy for guidance.
// The dashboard reads it to explain what's happening and why.
// ============================================================================

CookieCheater.modules.strategist = {

    tick: function() {
        // Only recalculate every 2 seconds (heavy analysis)
        if (!CookieCheater.throttle("strategist", 2000)) return;

        var S = CookieCheater.strategy = CookieCheater.strategy || {};
        var cps = Game.cookiesPs;
        var cookies = Game.cookies;

        // === GAME STATE SNAPSHOT ===
        S.phase = CookieCheater.getPhase();
        S.cps = cps;
        S.cookies = cookies;
        S.totalBuildings = 0;
        S.totalUpgrades = Game.upgradesOwned || 0;
        for (var i = 0; i < Game.ObjectsById.length; i++) {
            if (!Game.ObjectsById[i].locked) S.totalBuildings += Game.ObjectsById[i].amount;
        }
        S.highestBuilding = this._highestBuilding();
        S.achievementCount = Game.AchievementsOwned || 0;
        S.milk = S.achievementCount * 0.04;
        S.prestige = Game.prestige || 0;
        S.heavenlyChips = Game.heavenlyChips || 0;
        S.elderWrath = Game.elderWrath || 0;
        S.season = Game.season || "";
        S.dragonLevel = Game.dragonLevel || 0;
        S.lumps = Game.lumps || 0;
        S.wrinklerCount = 0;
        if (Game.wrinklers) {
            for (var i = 0; i < Game.wrinklers.length; i++) {
                if (Game.wrinklers[i].phase === 2) S.wrinklerCount++;
            }
        }

        // === LUCKY BANK STATUS ===
        S.luckyBank = CookieCheater.getLuckyBank();
        S.luckyBankFilled = S.luckyBank > 0 ? Math.min(1, cookies / S.luckyBank) : 1;

        // === BUFF STATE ===
        S.buffs = this._analyzeBuffs();

        // === INCOME BREAKDOWN ===
        S.incomeBreakdown = this._incomeBreakdown();

        // === PRIORITIES (ordered list) ===
        S.priorities = this._calculatePriorities();

        // === SHORT TERM GOALS (next 1-10 minutes) ===
        S.shortTermGoals = this._shortTermGoals();

        // === LONG TERM GOALS (next ascension / endgame targets) ===
        S.longTermGoals = this._longTermGoals();

        // === NEXT BEST ACTION ===
        S.nextAction = S.shortTermGoals.length > 0 ? S.shortTermGoals[0] : { action: "wait", reason: "Accumulating cookies" };

        // === ACTION HISTORY WITH REASONS ===
        // (populated by other modules calling CookieCheater.justify())
    },

    _highestBuilding: function() {
        for (var i = Game.ObjectsById.length - 1; i >= 0; i--) {
            var b = Game.ObjectsById[i];
            if (!b.locked && b.amount > 0) return { id: i, name: b.name, amount: b.amount };
        }
        return { id: 0, name: "Cursor", amount: 0 };
    },

    _analyzeBuffs: function() {
        var result = { active: [], cpsMult: 1, clickMult: 1, hasFrenzy: false, hasClickFrenzy: false };
        for (var name in Game.buffs) {
            var buff = Game.buffs[name];
            var entry = { name: name, timeLeft: Math.ceil((buff.time || 0) / (Game.fps || 30)) };
            if (buff.multCpS && buff.multCpS > 1) {
                result.cpsMult *= buff.multCpS;
                entry.type = "cps";
                entry.mult = buff.multCpS;
                if (buff.multCpS >= 7) result.hasFrenzy = true;
            }
            if (buff.multClick && buff.multClick > 1) {
                result.clickMult *= buff.multClick;
                entry.type = "click";
                entry.mult = buff.multClick;
                result.hasClickFrenzy = true;
            }
            result.active.push(entry);
        }
        result.comboMultiplier = result.cpsMult * result.clickMult;
        result.isCombo = result.hasFrenzy && result.hasClickFrenzy;
        return result;
    },

    _incomeBreakdown: function() {
        var total = Game.cookiesPs;
        if (total <= 0) return { top: [], clickPct: 0, passivePct: 100 };

        var buildings = [];
        for (var i = 0; i < Game.ObjectsById.length; i++) {
            var b = Game.ObjectsById[i];
            if (b.locked || b.amount === 0) continue;
            var pct = total > 0 ? (b.storedTotalCps / total * 100) : 0;
            if (pct > 0.1) {
                buildings.push({ name: b.name, cps: b.storedTotalCps, pct: Math.round(pct * 10) / 10 });
            }
        }
        buildings.sort(function(a, b) { return b.cps - a.cps; });

        return { top: buildings.slice(0, 5) };
    },

    _calculatePriorities: function() {
        var S = CookieCheater.strategy;
        var priorities = [];
        var cps = S.cps;
        var cookies = S.cookies;

        // --- Lucky bank ---
        if (S.luckyBankFilled < 1 && S.phase !== "early") {
            priorities.push({
                id: "lucky_bank",
                label: "Fill Lucky bank",
                urgency: S.luckyBankFilled < 0.5 ? "high" : "medium",
                progress: Math.round(S.luckyBankFilled * 100),
                reason: "Lucky golden cookies pay " + this._fmt(cps * 900) + " when bank is full. Currently at " + Math.round(S.luckyBankFilled * 100) + "%."
            });
        }

        // --- Golden cookie upgrades ---
        var gcUpgrades = ["Lucky day", "Serendipity", "Get lucky"];
        for (var i = 0; i < gcUpgrades.length; i++) {
            var u = Game.Upgrades[gcUpgrades[i]];
            if (u && !u.bought && u.unlocked) {
                var timeToAfford = u.basePrice > cookies ? Math.ceil((u.basePrice - cookies) / Math.max(cps, 1)) : 0;
                priorities.push({
                    id: "gc_" + i,
                    label: "Buy " + u.name,
                    urgency: "critical",
                    progress: Math.min(100, Math.round(cookies / u.basePrice * 100)),
                    reason: u.name + " doubles golden cookie frequency/duration. " +
                            (timeToAfford > 0 ? "Affordable in " + this._fmtTime(timeToAfford) + "." : "AFFORDABLE NOW!"),
                    eta: timeToAfford
                });
            }
        }

        // --- Kitten upgrades ---
        for (var i = 0; i < Game.UpgradesInStore.length; i++) {
            var u = Game.UpgradesInStore[i];
            if (u.bought) continue;
            if ((u.name || "").indexOf("Kitten") === -1) continue;
            var factor = CookieCheater.KB ? CookieCheater.KB._kittenFactor(u.name) : 0.1;
            var boost = S.milk * factor;
            var timeToAfford = u.basePrice > cookies ? Math.ceil((u.basePrice - cookies) / Math.max(cps, 1)) : 0;
            priorities.push({
                id: "kitten_" + u.name,
                label: "Buy " + u.name,
                urgency: "high",
                progress: Math.min(100, Math.round(cookies / u.basePrice * 100)),
                reason: "Multiplies ALL CPS by " + (1 + boost).toFixed(2) + "x (milk=" + S.milk.toFixed(1) + "%, factor=" + factor + "). " +
                        (timeToAfford > 0 ? "ETA " + this._fmtTime(timeToAfford) + "." : "BUY NOW!"),
                eta: timeToAfford
            });
        }

        // --- Ascension ---
        if (S.prestige > 0 || Game.cookiesEarned > 1e14) {
            var potentialPrestige = Math.floor(Math.sqrt(Game.cookiesEarned / 1e12));
            var newLevels = potentialPrestige - S.prestige;
            var ratio = S.prestige > 0 ? potentialPrestige / S.prestige : newLevels;
            var target = S.prestige === 0 ? 365 : S.prestige * 2;
            priorities.push({
                id: "ascension",
                label: S.prestige === 0 ? "First Ascension" : "Ascend (x" + ratio.toFixed(1) + ")",
                urgency: (S.prestige === 0 && newLevels >= 365) || ratio >= 2 ? "high" : "low",
                progress: Math.min(100, Math.round((S.prestige === 0 ? newLevels / 365 : ratio / 2) * 100)),
                reason: S.prestige === 0
                    ? newLevels + "/365 prestige levels. Each level = +1% CPS permanently."
                    : "Current: " + S.prestige + " -> " + potentialPrestige + " (" + ratio.toFixed(1) + "x). Target: 2x."
            });
        }

        // --- Season completion ---
        if (S.season && CookieCheater.modules.seasons) {
            priorities.push({
                id: "season",
                label: "Collecting " + S.season + " upgrades",
                urgency: "low",
                progress: -1,
                reason: "Cycling seasons to collect all permanent upgrades. Currently in " + S.season + "."
            });
        }

        // --- Dragon training ---
        if (S.dragonLevel > 0 && S.dragonLevel < 25) {
            priorities.push({
                id: "dragon",
                label: "Train Dragon (lv" + S.dragonLevel + "/25)",
                urgency: S.dragonLevel < 5 ? "medium" : "low",
                progress: Math.round(S.dragonLevel / 25 * 100),
                reason: S.dragonLevel < 5
                    ? "Need level 5 to set first aura. Currently level " + S.dragonLevel + "."
                    : S.dragonLevel < 21
                        ? "Need level 21 for Radiant Appetite (x2 CPS). Currently " + S.dragonLevel + "."
                        : "Need level 25 for dual aura. Currently " + S.dragonLevel + "."
            });
        }

        // --- Sugar lump spending ---
        if (S.lumps > 100) {
            priorities.push({
                id: "lumps",
                label: "Spend sugar lumps (" + S.lumps + " banked)",
                urgency: "low",
                progress: -1,
                reason: "Have " + S.lumps + " lumps (100 reserved for Sugar Baking +1%/lump). Excess can level up minigame buildings."
            });
        }

        // Sort by urgency
        var urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        priorities.sort(function(a, b) {
            return (urgencyOrder[a.urgency] || 9) - (urgencyOrder[b.urgency] || 9);
        });

        return priorities;
    },

    _shortTermGoals: function() {
        var S = CookieCheater.strategy;
        var goals = [];
        var cps = S.cps;
        var cookies = S.cookies;

        // What should we do in the next few minutes?

        // 1. Fill Lucky bank
        if (S.luckyBankFilled < 1 && S.phase !== "early") {
            var needed = S.luckyBank - cookies;
            goals.push({
                action: "save",
                target: "Lucky bank",
                reason: "Saving " + this._fmt(needed) + " more cookies for full Lucky payouts (" + this._fmtTime(needed / Math.max(cps, 1)) + ")",
                eta: Math.ceil(needed / Math.max(cps, 1))
            });
        }

        // 2. Best affordable purchase
        if (CookieCheater.modules.purchaser) {
            var phase = CookieCheater.modules.purchaser.currentPhase;
            if (phase && phase !== "waiting" && phase !== "early: clicking...") {
                goals.push({
                    action: "buy",
                    target: phase,
                    reason: "Purchaser: " + phase
                });
            }
        }

        // 3. Upcoming golden cookie upgrades
        var gcNames = ["Lucky day", "Serendipity", "Get lucky"];
        for (var i = 0; i < gcNames.length; i++) {
            var u = Game.Upgrades[gcNames[i]];
            if (u && !u.bought && u.unlocked && !u.canBuy()) {
                var eta = Math.ceil((u.basePrice - cookies) / Math.max(cps, 1));
                if (eta < 600) { // Within 10 minutes
                    goals.push({
                        action: "save_for",
                        target: u.name,
                        reason: u.name + " costs " + this._fmt(u.basePrice) + ". Affordable in " + this._fmtTime(eta) + ". This upgrade is game-changing.",
                        eta: eta
                    });
                }
            }
        }

        // 4. Wait for golden cookie during Frenzy
        if (S.buffs.hasFrenzy && !S.buffs.hasClickFrenzy) {
            goals.push({
                action: "wait_combo",
                target: "Click Frenzy",
                reason: "Frenzy active (x" + S.buffs.cpsMult + ")! Waiting for Click Frenzy to combo. Grimoire should cast FtHoF now."
            });
        }

        return goals;
    },

    _longTermGoals: function() {
        var S = CookieCheater.strategy;
        var goals = [];

        // Ascension milestone
        var potentialPrestige = Math.floor(Math.sqrt((Game.cookiesEarned || 0) / 1e12));
        if (S.prestige === 0) {
            goals.push({
                label: "First Ascension at 365 prestige",
                progress: Math.min(100, Math.round(potentialPrestige / 365 * 100)),
                reason: "365 prestige unlocks Legacy, Heavenly Cookies, Dragon, and key upgrades. Currently at " + potentialPrestige + "."
            });
        } else {
            var target = S.prestige * 2;
            goals.push({
                label: "Ascend at " + target + " prestige (2x)",
                progress: Math.min(100, Math.round(potentialPrestige / target * 100)),
                reason: "Double prestige from " + S.prestige + " to " + target + " for maximum efficiency. Currently " + potentialPrestige + "."
            });
        }

        // Unlock all buildings
        var unlockedCount = 0;
        for (var i = 0; i < Game.ObjectsById.length; i++) {
            if (!Game.ObjectsById[i].locked) unlockedCount++;
        }
        if (unlockedCount < Game.ObjectsById.length) {
            var next = Game.ObjectsById[unlockedCount];
            goals.push({
                label: "Unlock " + (next ? next.name : "next building"),
                progress: Math.round(unlockedCount / Game.ObjectsById.length * 100),
                reason: unlockedCount + "/" + Game.ObjectsById.length + " buildings unlocked. Next one requires more CPS."
            });
        }

        // All seasonal upgrades
        goals.push({
            label: "Collect all seasonal upgrades",
            progress: -1,
            reason: "Cycle through Christmas/Halloween/Easter/Valentine to get permanent CPS bonuses."
        });

        // Dragon max level
        if (S.dragonLevel < 25 && S.dragonLevel > 0) {
            goals.push({
                label: "Max Dragon (lv" + S.dragonLevel + "/25)",
                progress: Math.round(S.dragonLevel / 25 * 100),
                reason: "Level 21 = Radiant Appetite (x2 CPS). Level 25 = dual aura. Huge endgame multiplier."
            });
        }

        return goals;
    },

    _fmt: function(n) {
        if (n < 1e6) return Math.round(n).toLocaleString();
        if (n < 1e9) return (n / 1e6).toFixed(1) + "M";
        if (n < 1e12) return (n / 1e9).toFixed(1) + "B";
        if (n < 1e15) return (n / 1e12).toFixed(1) + "T";
        return n.toExponential(1);
    },

    _fmtTime: function(seconds) {
        if (seconds < 60) return Math.ceil(seconds) + "s";
        if (seconds < 3600) return Math.ceil(seconds / 60) + "m";
        return (seconds / 3600).toFixed(1) + "h";
    }
};

// Global justify function - modules call this to log actions with reasons
CookieCheater.justify = function(module, action, reason) {
    CookieCheater.log(module, action, reason);
};
