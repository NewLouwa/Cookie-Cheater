// Building & Upgrade purchase optimizer
// Uses payback period (cost / delta_CPS) to find the best next purchase.
// Handles all game phases: empty bakery (0 CPS) through endgame.

CookieCheater.modules.purchaser = {
    currentPhase: "scanning",
    _lastPurchaseTime: 0,
    _purchaseCooldown: 100,

    tick: function() {
        if (Date.now() - this._lastPurchaseTime < this._purchaseCooldown) return;
        if (!CookieCheater.throttle("purchaser", 250)) return;

        var cookies = Game.cookies;
        var cps = Game.cookiesPs;

        // === EARLY GAME BOOTSTRAP ===
        // When CPS is 0 or very low, just buy the cheapest thing available
        if (cps < 1) {
            this._earlyGameBuy(cookies);
            return;
        }

        // === LUCKY BANKING ===
        // Keep enough cookies to maximize Lucky golden cookie payouts
        // Lucky gives min(900*CPS, 15% of bank). To max: bank >= 6000*CPS
        var luckyBank = CookieCheater.getLuckyBank();
        var spendable = cookies - luckyBank;

        // In mid+ game, respect Lucky bank (don't spend below it)
        if (CookieCheater.getPhase() !== "early" && spendable < 0) {
            this.currentPhase = "Lucky banking (" + Math.ceil(-spendable / cps) + "s)";
            return;
        }
        // Use spendable cookies for affordability checks
        var effectiveCookies = CookieCheater.getPhase() === "early" ? cookies : Math.max(cookies, spendable);

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

        // Buy the best affordable upgrade if it beats best affordable building
        if (bestUpgrade && bestUpgrade.affordable) {
            var buildingPayback = bestAffordableBuilding ? bestAffordableBuilding.payback : Infinity;
            if (bestUpgrade.payback <= buildingPayback) {
                bestUpgrade.ref.buy();
                CookieCheater.stats.upgradesBought++;
                var cat = bestUpgrade.category || "?";
                var reason = bestUpgrade.name + " [" + cat + "] $" + this._fmt(bestUpgrade.price) +
                    " — payback " + Math.round(bestUpgrade.payback * (bestUpgrade.priority || 1)) + "s" +
                    (bestUpgrade.priority > 1.5 ? " (priority x" + bestUpgrade.priority + "!)" : "");
                CookieCheater.justify("purchaser", "BUY_UPGRADE", reason);
                this._lastPurchaseTime = Date.now();
                this.currentPhase = "bought upgrade: " + bestUpgrade.name;
                return;
            }
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
                " — best ROI (payback " + bPb + "s), beats " +
                (bestUpgrade ? bestUpgrade.name + " (" + Math.round(bestUpgrade.payback) + "s)" : "no upgrades"));
            this._lastPurchaseTime = Date.now();
            this.currentPhase = "bought: " + bName;
            return;
        }

        // Fallback: buy any cheap affordable upgrade
        if (this._buyAffordableCheapUpgrades(cookies, cps)) return;

        this.currentPhase = "waiting";
    },

    // Early game: just buy anything affordable, cheapest first
    _earlyGameBuy: function(cookies) {
        // Buy cheapest affordable upgrade first (often cursor/grandma upgrades)
        var cheapestUpgrade = null;
        for (var i = 0; i < Game.UpgradesInStore.length; i++) {
            var u = Game.UpgradesInStore[i];
            if (u.bought || !u.canBuy()) continue;
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
