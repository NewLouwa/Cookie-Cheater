// Building & Upgrade purchase optimizer
// Uses payback period (cost / delta_CPS) to find the best next purchase.
// Handles all game phases: empty bakery (0 CPS) through endgame.

CookieCheater.modules.purchaser = {
    currentPhase: "scanning",
    _lastPurchaseTime: 0,
    _purchaseCooldown: 100,
    _postAscensionMode: false,
    _postAscensionStart: 0,

    tick: function() {
        // During combos: buy as fast as possible (no cooldown, no throttle)
        var comboActive = CookieCheater._comboActive;
        if (!comboActive) {
            if (Date.now() - this._lastPurchaseTime < this._purchaseCooldown) return;
            if (!CookieCheater.throttle("purchaser", 250)) return;
        }

        var cookies = Game.cookies;
        var cps = Game.cookiesPs;

        // === POST-ASCENSION UPGRADE RUSH ===
        // After ascending, the first upgrades are MASSIVELY more powerful than buildings
        // because prestige multiplies everything. A +2% CPS upgrade with 798 prestige
        // gives way more than buying 10 Cursors.
        // Detect: prestige > 0 AND total buildings < 200 (fresh run)
        if (Game.prestige > 0) {
            var totalBuildings = 0;
            for (var bi = 0; bi < Game.ObjectsById.length; bi++) {
                if (!Game.ObjectsById[bi].locked) totalBuildings += Game.ObjectsById[bi].amount;
            }
            if (totalBuildings < 500) {
                this._postAscensionMode = true;
                this._postAscensionBuy(cookies, cps);
                return;
            } else {
                this._postAscensionMode = false;
            }
        }

        // === EARLY GAME BOOTSTRAP ===
        if (cps < 1) {
            this._earlyGameBuy(cookies);
            return;
        }

        // === COMBO-AWARE PURCHASING ===
        // Tier 1 (Frenzy x7): buy upgrades + good-ROI buildings (no reckless spending)
        // Tier 2+ (x100+): aggressive building rush to maximize CPS during multiplier
        // After any combo: upgrade rush (permanent multipliers first)
        var comboTier = CookieCheater._comboTier || 0;
        if (comboTier >= 1) {
            // ANY buff active — aggressive building + upgrade rush
            // Tier 1 (Frenzy x7): buy fast, skip Lucky bank
            // Tier 2+ (x21+): full aggressive rush
            this._comboBuildingRush(cookies, cps);
            return;
        }
        if (this._comboUpgradeRush(cookies, cps)) return;

        // === LUCKY BANKING (soft reserve) ===
        // Skip Lucky banking during any combo tier — spend while multiplier is active
        var luckyBank = CookieCheater.getLuckyBank();
        var belowBank = comboTier > 0 ? false : (cookies < luckyBank);

        // Reserve cookies for garden planting (garden module sets this)
        var gardenReserve = CookieCheater._gardenReserve || 0;
        // Effective cookies = what we can spend after garden reserve
        // Don't let garden reserve block ALL purchases, cap at 60% of bank
        var effectiveReserve = Math.min(gardenReserve, cookies * 0.6);
        var effectiveCookies = Math.max(0, cookies - effectiveReserve);

        // Find ALL options
        var bestUpgrade = this._findBestUpgrade(effectiveCookies, cps);
        var buildings = this._rankBuildings(effectiveCookies, cps);
        var bestAffordableBuilding = buildings.affordable;
        var bestOverallBuilding = buildings.overall;

        // Should we save for something better that's almost affordable?
        var saveTarget = null;
        var candidates = [];
        if (bestUpgrade && !bestUpgrade.affordable) candidates.push(bestUpgrade);
        if (bestOverallBuilding && !bestOverallBuilding.affordable) candidates.push(bestOverallBuilding);

        for (var ci = 0; ci < candidates.length; ci++) {
            var c = candidates[ci];
            var timeToAfford = (c.price - cookies) / Math.max(cps, 0.001);
            var bestAffordPayback = bestAffordableBuilding ? bestAffordableBuilding.payback : Infinity;
            if (bestUpgrade && bestUpgrade.affordable && bestUpgrade.payback < bestAffordPayback) {
                bestAffordPayback = bestUpgrade.payback;
            }
            // Save if: affordable within 60s AND significantly better payback
            if (timeToAfford > 0 && timeToAfford < 60 && c.payback < bestAffordPayback * 0.7) {
                saveTarget = c;
                break;
            }
        }

        if (saveTarget) {
            var eta = Math.ceil((saveTarget.price - cookies) / cps);
            this.currentPhase = "saving for " + saveTarget.name + " (" + eta + "s)";
            CookieCheater.justify("purchaser", "SAVING",
                "Waiting " + eta + "s for " + saveTarget.name + " ($" + this._fmt(saveTarget.price) + ") — 30%+ better ROI than buying now");
            return;
        }

        // === LUCKY BANK SOFT CHECK ===
        // If below Lucky bank AND the best purchase costs >50% of bank target
        // AND payback is slow (>300s), defer it. Otherwise buy anyway.
        var bestToBuy = null;
        var bestToBuyType = null;

        if (bestUpgrade && bestUpgrade.affordable) {
            var buildingPayback = bestAffordableBuilding ? bestAffordableBuilding.payback : Infinity;
            if (bestUpgrade.payback <= buildingPayback) {
                bestToBuy = bestUpgrade;
                bestToBuyType = "upgrade";
            }
        }
        if (!bestToBuy && bestAffordableBuilding) {
            bestToBuy = bestAffordableBuilding;
            bestToBuyType = "building";
        }

        if (bestToBuy && belowBank) {
            var costRatio = bestToBuy.price / Math.max(luckyBank, 1);
            var rawPayback = bestToBuy.payback * (bestToBuy.priority || 1);
            // Only defer if: expensive (>50% of bank) AND slow payback (>300s)
            // Otherwise the growth from buying outweighs the Lucky bank benefit
            if (costRatio > 0.5 && rawPayback > 300) {
                this.currentPhase = "Lucky bank (" + Math.round(cookies / luckyBank * 100) + "%) — deferring " + bestToBuy.name;
                return;
            }
        }

        // Buy the best affordable upgrade if it beats best affordable building
        if (bestToBuyType === "upgrade" && bestUpgrade) {
                bestUpgrade.ref.buy();
                CookieCheater.stats.upgradesBought++;
                var cat = bestUpgrade.category || "?";
                var reason = bestUpgrade.name + " [" + cat + "] $" + this._fmt(bestUpgrade.price) +
                    " — payback " + Math.round(bestUpgrade.payback * (bestUpgrade.priority || 1)) + "s" +
                    (bestUpgrade.priority > 1.5 ? " (priority x" + bestUpgrade.priority + "!)" : "") +
                    (belowBank ? " (Lucky bank " + Math.round(cookies / luckyBank * 100) + "%, but good ROI)" : "");
                CookieCheater.justify("purchaser", "BUY_UPGRADE", reason);
                this._lastPurchaseTime = Date.now();
                this.currentPhase = "bought upgrade: " + bestUpgrade.name;
                return;
        }

        // Buy the best affordable building
        if (bestAffordableBuilding) {
            bestAffordableBuilding.ref.buy();
            CookieCheater.stats.buildingsBought++;
            var bName = bestAffordableBuilding.name;
            var bAmt = bestAffordableBuilding.ref.amount;
            var bPb = Math.round(bestAffordableBuilding.payback);
            CookieCheater.justify("purchaser", "BUY_BUILDING",
                bName + " #" + bAmt + " $" + this._fmt(bestAffordableBuilding.price) +
                " — best ROI (payback " + bPb + "s)" +
                (belowBank ? " (Lucky bank " + Math.round(cookies / luckyBank * 100) + "%, but growing CPS is more important)" : ""));
            this._lastPurchaseTime = Date.now();
            this.currentPhase = "bought: " + bName;
            return;
        }

        // Fallback: buy any cheap affordable upgrade
        if (this._buyAffordableCheapUpgrades(cookies, cps)) return;

        this.currentPhase = "waiting";
    },

    // DURING combo: buy buildings as fast as possible to maximize CPS while multiplier is active.
    // Every building bought increases CPS, which is multiplied by the combo (x5000+).
    // Also buy any affordable upgrade that's even better ROI.
    _comboBuildingRush: function(cookies, cps) {
        // First: buy any affordable upgrade (upgrades are always better during combo)
        var KB = CookieCheater.KB;
        for (var i = 0; i < Game.UpgradesInStore.length; i++) {
            var u = Game.UpgradesInStore[i];
            if (u.bought || !u.canBuy()) continue;
            var analysis = KB ? KB.analyzeUpgrade(u, cps) : null;
            if (analysis && analysis.skip) continue;
            u.buy();
            CookieCheater.stats.upgradesBought++;
            CookieCheater.justify("purchaser", "COMBO_UPGRADE",
                "[DURING COMBO] " + u.name + " [" + (analysis ? analysis.category : "?") + "] $" + this._fmt(u.basePrice) +
                " — upgrading while combo multiplier is active!");
            this._lastPurchaseTime = Date.now();
            this.currentPhase = "COMBO: " + u.name;
            return;
        }

        // Then: buy the building with best payback (uses Cookie Monster formula)
        var bestBuilding = null;
        var bestPayback = Infinity;
        for (var i = 0; i < Game.ObjectsById.length; i++) {
            var b = Game.ObjectsById[i];
            if (b.locked || b.price > cookies) continue;
            var singleCps = b.storedCps * Game.globalCpsMult;
            if (singleCps <= 0) singleCps = b.baseCps * Game.globalCpsMult;
            if (singleCps <= 0) continue;
            var payback = this._opportunityCostPayback(b.price, singleCps, cookies, cps);
            if (payback < bestPayback) {
                bestPayback = payback;
                bestBuilding = b;
            }
        }

        if (bestBuilding && bestBuilding.price <= cookies) {
            bestBuilding.buy();
            CookieCheater.stats.buildingsBought++;
            CookieCheater.justify("purchaser", "COMBO_BUILDING",
                "[DURING COMBO] " + bestBuilding.name + " #" + bestBuilding.amount +
                " $" + this._fmt(bestBuilding.price) +
                " — maximizing CPS while x" + Math.round(CookieCheater._comboScore || 1) + " multiplier active!");
            this._lastPurchaseTime = Date.now();
            this.currentPhase = "COMBO: " + bestBuilding.name;
        }
    },

    // Post-combo upgrade rush: buy ALL affordable upgrades before any buildings.
    // During/after a combo, cookies spike massively. Upgrades are multiplicative
    // (kittens, flavored cookies, tiered doublings) — buying them NOW amplifies
    // all future income permanently. Buildings are just additive.
    //
    // Detection: combo active OR combo ended within last 30 seconds
    // Priority order: goldenCookie > kitten > tiered > special > flavored > all others
    _comboUpgradeRush: function(cookies, cps) {
        // Check if we're in a combo or just exited one
        var inCombo = CookieCheater._comboActive;
        var comboLog = CookieCheater.modules.pantheon ? CookieCheater.modules.pantheon._comboLog : [];
        var lastCombo = comboLog.length > 0 ? comboLog[comboLog.length - 1] : null;
        var justEndedCombo = lastCombo && lastCombo.endTime && (Date.now() - lastCombo.endTime < 30000);

        if (!inCombo && !justEndedCombo) return false;

        // Sort all affordable upgrades by KB priority (highest first)
        var KB = CookieCheater.KB;
        var affordable = [];
        for (var i = 0; i < Game.UpgradesInStore.length; i++) {
            var u = Game.UpgradesInStore[i];
            if (u.bought || !u.canBuy()) continue;

            var analysis = KB ? KB.analyzeUpgrade(u, cps) : null;
            if (analysis && analysis.skip) continue; // Don't buy Elder Pledge etc

            affordable.push({
                ref: u,
                name: u.name,
                price: u.basePrice,
                priority: analysis ? analysis.priority : 0.5,
                category: analysis ? analysis.category : "unknown",
                value: analysis ? analysis.value : 0,
            });
        }

        if (affordable.length === 0) return false;

        // Sort by priority descending (kittens first, then golden cookie, then tiered...)
        affordable.sort(function(a, b) { return b.priority - a.priority; });

        // Buy the highest priority affordable upgrade
        var best = affordable[0];
        best.ref.buy();
        CookieCheater.stats.upgradesBought++;

        var comboTag = inCombo ? "COMBO" : "POST-COMBO";
        CookieCheater.justify("purchaser", "UPGRADE_RUSH",
            "[" + comboTag + "] " + best.name + " [" + best.category + "] $" + this._fmt(best.price) +
            " — priority " + best.priority +
            " (" + affordable.length + " upgrades still affordable)" +
            (inCombo ? " — buying during active combo for maximum impact!" : " — spending combo winnings on permanent multipliers"));

        this._lastPurchaseTime = Date.now();
        this.currentPhase = comboTag + ": " + best.name;
        return true;
    },

    // Post-ascension buying: UPGRADES FIRST, always.
    // After ascending with prestige, upgrades give multiplicative boosts
    // that compound with the prestige multiplier. A single +2% cookie upgrade
    // with 798 prestige = +2% on top of 798% base = much more than a building.
    _postAscensionBuy: function(cookies, cps) {
        // Priority 1: buy ANY affordable upgrade (sorted by KB priority)
        var KB = CookieCheater.KB;
        var bestUpgrade = null;
        var bestPriority = -1;

        for (var i = 0; i < Game.UpgradesInStore.length; i++) {
            var u = Game.UpgradesInStore[i];
            if (u.bought || !u.canBuy()) continue;
            var analysis = KB ? KB.analyzeUpgrade(u, cps) : null;
            if (analysis && analysis.skip) continue;
            var pri = analysis ? analysis.priority : 0.5;
            if (pri > bestPriority) {
                bestPriority = pri;
                bestUpgrade = u;
            }
        }

        if (bestUpgrade) {
            bestUpgrade.buy();
            CookieCheater.stats.upgradesBought++;
            var cat = KB ? KB.analyzeUpgrade(bestUpgrade, cps).category : "?";
            CookieCheater.justify("purchaser", "POST_ASCENSION",
                "[ASCENSION RUSH] " + bestUpgrade.name + " [" + cat + "] $" + this._fmt(bestUpgrade.basePrice) +
                " — upgrades first! Prestige x" + Game.prestige + " multiplies everything");
            this._lastPurchaseTime = Date.now();
            this.currentPhase = "ASCENSION: " + bestUpgrade.name;
            return;
        }

        // Priority 2: if no upgrades affordable, buy best building
        // But only buy a building if it's cheap enough to get us to the NEXT upgrade faster
        var bestBuilding = null;
        var bestPayback = Infinity;
        for (var i = 0; i < Game.ObjectsById.length; i++) {
            var b = Game.ObjectsById[i];
            if (b.locked || b.price > cookies) continue;
            var singleCps = b.storedCps * Game.globalCpsMult;
            if (singleCps <= 0) singleCps = b.baseCps * Game.globalCpsMult;
            if (singleCps <= 0) continue;
            var payback = this._opportunityCostPayback(b.price, singleCps, cookies, cps);
            if (payback < bestPayback) { bestPayback = payback; bestBuilding = b; }
        }

        if (bestBuilding) {
            bestBuilding.buy();
            CookieCheater.stats.buildingsBought++;
            CookieCheater.justify("purchaser", "POST_ASCENSION",
                "[ASCENSION] " + bestBuilding.name + " #" + bestBuilding.amount +
                " — building CPS to afford next upgrade");
            this._lastPurchaseTime = Date.now();
            this.currentPhase = "ASCENSION: " + bestBuilding.name;
        }
    },

    // Pre-ascension mega spend: sell everything, buy all upgrades, buy all buildings
    // Called manually from dashboard or auto when ascending
    preAscensionSpend: function() {
        var log = [];

        // 1. Sell ALL market positions
        try {
            var bank = Game.ObjectsById[5];
            if (bank && bank.minigame) {
                var M = bank.minigame;
                for (var i = 0; i < M.goodsById.length; i++) {
                    var g = M.goodsById[i];
                    if (g.stock > 0) {
                        M.sellGood(i, g.stock);
                        log.push("Sold " + g.symbol + " x" + g.stock);
                    }
                }
            }
        } catch(e) {}

        // 2. Pop ALL wrinklers
        try {
            if (Game.wrinklers) {
                var popped = 0;
                for (var i = 0; i < Game.wrinklers.length; i++) {
                    if (Game.wrinklers[i].phase === 2) {
                        Game.wrinklers[i].hp = 0;
                        popped++;
                    }
                }
                if (popped > 0) log.push("Popped " + popped + " wrinklers");
            }
        } catch(e) {}

        // 3. Buy ALL affordable upgrades (most valuable first)
        var upgradesBought = 0;
        for (var pass = 0; pass < 20; pass++) { // Multiple passes since buying unlocks more
            var bought = false;
            for (var i = 0; i < Game.UpgradesInStore.length; i++) {
                var u = Game.UpgradesInStore[i];
                if (!u.bought && u.canBuy()) {
                    // Skip Elder Pledge/Covenant (doesn't help for ascension)
                    if (u.name === "Elder Pledge" || u.name === "Elder Covenant" || u.name === "Revoke Elder Covenant") continue;
                    u.buy();
                    upgradesBought++;
                    bought = true;
                }
            }
            if (!bought) break;
        }
        if (upgradesBought > 0) log.push("Bought " + upgradesBought + " upgrades");

        // 4. Buy buildings — best payback first, until out of cookies
        var buildingsBought = 0;
        for (var pass = 0; pass < 500; pass++) {
            var best = null;
            var bestPayback = Infinity;
            for (var i = 0; i < Game.ObjectsById.length; i++) {
                var b = Game.ObjectsById[i];
                if (b.locked || b.price > Game.cookies) continue;
                var cps = b.storedCps * Game.globalCpsMult;
                if (cps <= 0) cps = b.baseCps * Game.globalCpsMult;
                if (cps <= 0) continue;
                var pb = b.price / cps;
                if (pb < bestPayback) { bestPayback = pb; best = b; }
            }
            if (!best) break;
            best.buy();
            buildingsBought++;
        }
        if (buildingsBought > 0) log.push("Bought " + buildingsBought + " buildings");

        CookieCheater.justify("purchaser", "PRE_ASCENSION",
            "MEGA SPEND: " + log.join(" | ") +
            " | Cookies remaining: " + this._fmt(Game.cookies) +
            " | CPS now: " + this._fmt(Game.cookiesPs));

        return log;
    },

    // Early game: just buy anything affordable, cheapest first
    _earlyGameBuy: function(cookies) {
        var cheapestUpgrade = null;
        for (var i = 0; i < Game.UpgradesInStore.length; i++) {
            var u = Game.UpgradesInStore[i];
            if (u.bought || !u.canBuy()) continue;
            // Skip toggle/UI upgrades and module-managed upgrades
            if (CookieCheater.KB) {
                var a = CookieCheater.KB.analyzeUpgrade(u, Game.cookiesPs);
                if (a.skip) continue;
            }
            if (!cheapestUpgrade || u.basePrice < cheapestUpgrade.basePrice) {
                cheapestUpgrade = u;
            }
        }

        // Buy cheapest affordable building
        var cheapestBuilding = null;
        for (var i = 0; i < Game.ObjectsById.length; i++) {
            var b = Game.ObjectsById[i];
            if (b.locked || b.price > cookies) continue;
            if (!cheapestBuilding || b.price < cheapestBuilding.price) {
                cheapestBuilding = b;
            }
        }

        // Buy whichever is cheaper
        if (cheapestUpgrade && (!cheapestBuilding || cheapestUpgrade.basePrice < cheapestBuilding.price)) {
            cheapestUpgrade.buy();
            CookieCheater.stats.upgradesBought++;
            CookieCheater.log("purchaser", "early_upgrade", cheapestUpgrade.name);
            this._lastPurchaseTime = Date.now();
            this.currentPhase = "early: " + cheapestUpgrade.name;
            return;
        }

        if (cheapestBuilding) {
            cheapestBuilding.buy();
            CookieCheater.stats.buildingsBought++;
            CookieCheater.log("purchaser", "early_building", cheapestBuilding.name + " #" + cheapestBuilding.amount);
            this._lastPurchaseTime = Date.now();
            this.currentPhase = "early: " + cheapestBuilding.name;
            return;
        }

        this.currentPhase = "early: clicking...";
    },

    // Cookie Monster payback formula:
    // payback = max(cost - bank, 0) / CPS  +  cost / deltaCPS
    // Part 1: time to AFFORD it (opportunity cost of waiting)
    // Part 2: time for it to PAY FOR ITSELF
    _opportunityCostPayback: function(price, deltaCps, cookies, cps) {
        var timeToAfford = Math.max(price - cookies, 0) / Math.max(cps, 0.001);
        var timeToPayback = price / Math.max(deltaCps, 0.001);
        return timeToAfford + timeToPayback;
    },

    _rankBuildings: function(cookies, cps) {
        var bestOverall = null;
        var bestOverallPayback = Infinity;
        var bestAffordable = null;
        var bestAffordablePayback = Infinity;

        for (var i = 0; i < Game.ObjectsById.length; i++) {
            var b = Game.ObjectsById[i];
            if (b.locked) continue;

            var price = b.price;
            var singleCps = b.storedCps * Game.globalCpsMult;
            if (singleCps <= 0) singleCps = b.baseCps * Game.globalCpsMult;
            if (singleCps <= 0) singleCps = 0.001;

            // Use Cookie Monster's opportunity cost formula
            var payback = this._opportunityCostPayback(price, singleCps, cookies, cps);
            var milestoneFactor = this._milestoneFactor(b);
            payback = payback / milestoneFactor;

            var entry = { ref: b, name: b.name, price: price, payback: payback, affordable: cookies >= price };

            if (payback < bestOverallPayback) {
                bestOverallPayback = payback;
                bestOverall = entry;
            }
            if (cookies >= price && payback < bestAffordablePayback) {
                bestAffordablePayback = payback;
                bestAffordable = entry;
            }
        }

        return { overall: bestOverall, affordable: bestAffordable };
    },

    _milestoneFactor: function(building) {
        var milestones = [1, 5, 25, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500];
        var amount = building.amount;
        for (var i = 0; i < milestones.length; i++) {
            var m = milestones[i];
            if (amount < m && amount >= m - 3) return 2.0;
        }
        return 1.0;
    },

    _findBestUpgrade: function(cookies, cps) {
        if (!CookieCheater.KB) return null; // KB not loaded yet

        var best = null;
        var bestPayback = Infinity;

        for (var i = 0; i < Game.UpgradesInStore.length; i++) {
            var u = Game.UpgradesInStore[i];
            if (u.bought) continue;

            // Use Knowledge Base to analyze this upgrade
            var analysis = CookieCheater.KB.analyzeUpgrade(u, cps);

            // Skip upgrades managed by other modules (Elder Pledge, season switchers)
            if (analysis.skip) continue;

            var payback = analysis.payback;

            // For unknown/low-value upgrades, still buy if cheap
            if (analysis.category === "unknown" && analysis.value <= 0) {
                var phase = CookieCheater.getPhase();
                var maxMinutes = phase === "early" ? 2 : phase === "mid" ? 5 : 10;
                var minutesCost = u.basePrice / Math.max(cps * 60, 0.001);
                if (minutesCost > maxMinutes) continue;
            }

            if (payback < bestPayback) {
                bestPayback = payback;
                best = {
                    ref: u,
                    name: u.name,
                    price: u.basePrice,
                    payback: payback,
                    affordable: u.canBuy(),
                    category: analysis.category,
                    priority: analysis.priority
                };
            }
        }

        return best;
    },

    _buyAffordableCheapUpgrades: function(cookies, cps) {
        // Buy any affordable upgrade that's cheap relative to income
        // Uses KB to skip module-managed upgrades (Elder Pledge, season switchers)
        var phase = CookieCheater.getPhase();
        var seconds = phase === "early" ? 120 : phase === "mid" ? 60 : 30;
        var threshold = cps * seconds;

        for (var i = 0; i < Game.UpgradesInStore.length; i++) {
            var u = Game.UpgradesInStore[i];
            if (u.bought || !u.canBuy()) continue;

            // Skip module-managed upgrades
            if (CookieCheater.KB) {
                var analysis = CookieCheater.KB.analyzeUpgrade(u, cps);
                if (analysis.skip) continue;
            }

            if (u.basePrice <= threshold) {
                u.buy();
                CookieCheater.stats.upgradesBought++;
                var cat = CookieCheater.KB ? CookieCheater.KB.analyzeUpgrade(u, cps).category : "?";
                CookieCheater.log("purchaser", "buy_cheap", u.name + " [" + cat + "]");
                this._lastPurchaseTime = Date.now();
                return true;
            }
        }
        return false;
    },

    _fmt: function(n) {
        if (n < 1e6) return n.toFixed(0);
        if (n < 1e9) return (n / 1e6).toFixed(1) + "M";
        if (n < 1e12) return (n / 1e9).toFixed(1) + "B";
        if (n < 1e15) return (n / 1e12).toFixed(1) + "T";
        return n.toExponential(1);
    }
};
