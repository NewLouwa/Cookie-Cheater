// Building & Upgrade purchase optimizer
// Uses payback period (cost / delta_CPS) to find the best next purchase.
// Accounts for upgrade multipliers and save-for-upgrade logic.

CookieCheater.modules.purchaser = {
    currentPhase: "scanning",
    _lastPurchaseTime: 0,
    _purchaseCooldown: 100, // ms between purchases to let the game recalculate

    tick: function() {
        // Don't buy too fast, let the game settle between purchases
        if (Date.now() - this._lastPurchaseTime < this._purchaseCooldown) return;
        // Only evaluate every few frames for performance
        if (!CookieCheater.throttle("purchaser", 250)) return;

        var cookies = Game.cookies;
        var cps = Game.cookiesPs;

        // Find ALL options: best affordable + best overall (to save for)
        var bestUpgrade = this._findBestUpgrade(cookies, cps);
        var buildings = this._rankBuildings(cookies, cps);
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
            // Save if: affordable within 60s AND better payback than what we can buy now
            if (timeToAfford > 0 && timeToAfford < 60 && c.payback < bestAffordPayback * 0.7) {
                saveTarget = c;
                break;
            }
        }

        if (saveTarget) {
            this.currentPhase = "saving for " + saveTarget.name + " (" + Math.ceil((saveTarget.price - cookies) / cps) + "s)";
            return;
        }

        // Buy the best affordable upgrade if it beats best affordable building
        if (bestUpgrade && bestUpgrade.affordable) {
            var buildingPayback = bestAffordableBuilding ? bestAffordableBuilding.payback : Infinity;
            if (bestUpgrade.payback <= buildingPayback) {
                bestUpgrade.ref.buy();
                CookieCheater.stats.upgradesBought++;
                CookieCheater.log("purchaser", "buy_upgrade", bestUpgrade.name);
                this._lastPurchaseTime = Date.now();
                this.currentPhase = "bought upgrade: " + bestUpgrade.name;
                return;
            }
        }

        // Buy the best affordable building
        if (bestAffordableBuilding) {
            bestAffordableBuilding.ref.buy();
            CookieCheater.stats.buildingsBought++;
            CookieCheater.log("purchaser", "buy_building", bestAffordableBuilding.name + " #" + (bestAffordableBuilding.ref.amount));
            this._lastPurchaseTime = Date.now();
            this.currentPhase = "bought: " + bestAffordableBuilding.name;
            return;
        }

        // Fallback: buy any cheap affordable upgrade
        this._buyAffordableCheapUpgrades(cookies, cps);

        this.currentPhase = "waiting";
    },

    _rankBuildings: function(cookies, cps) {
        // Returns { overall: best by payback (may not be affordable), affordable: best affordable by payback }
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

            var payback = price / singleCps;
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
        // Building milestones that unlock tiered upgrades: 1, 5, 25, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500
        var milestones = [1, 5, 25, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500];
        var amount = building.amount;

        for (var i = 0; i < milestones.length; i++) {
            var m = milestones[i];
            if (amount < m && amount >= m - 3) {
                // Within 3 of a milestone: boost priority by 2x
                return 2.0;
            }
        }
        return 1.0;
    },

    _findBestUpgrade: function(cookies, cps) {
        var best = null;
        var bestPayback = Infinity;

        for (var i = 0; i < Game.UpgradesInStore.length; i++) {
            var u = Game.UpgradesInStore[i];
            if (u.bought) continue;

            var price = u.basePrice;
            var deltaCps = this._estimateUpgradeDeltaCps(u);

            var payback;
            if (deltaCps > 0) {
                payback = price / deltaCps;
            } else {
                // Non-CPS upgrade (clicking, golden cookie, eggs, etc.)
                // Buy if cheap enough relative to current income
                var minutesCost = price / Math.max(cps * 60, 0.001);
                if (minutesCost <= CookieCheater.config.buy_upgrades_under_cps_minutes) {
                    payback = price / Math.max(cps * 0.1, 0.001); // Treat as 10% CPS boost estimate
                } else {
                    continue; // Too expensive, skip
                }
            }

            if (payback < bestPayback) {
                bestPayback = payback;
                best = {
                    ref: u,
                    name: u.name,
                    price: price,
                    payback: payback,
                    affordable: u.canBuy()
                };
            }
        }

        return best;
    },

    _estimateUpgradeDeltaCps: function(upgrade) {
        // Try to figure out which building this upgrade boosts
        // Most tiered upgrades have a building ID in their buildingTie
        if (upgrade.buildingTie1) {
            // This upgrade doubles a building's production
            return upgrade.buildingTie1.storedTotalCps;
        }
        if (upgrade.buildingTie) {
            return upgrade.buildingTie.storedTotalCps;
        }

        // Check the description for "twice as efficient" pattern
        var desc = upgrade.desc || "";
        for (var i = 0; i < Game.ObjectsById.length; i++) {
            var b = Game.ObjectsById[i];
            if (desc.indexOf(b.plural) !== -1 && desc.indexOf("twice") !== -1) {
                return b.storedTotalCps;
            }
            if (desc.indexOf(b.name) !== -1 && desc.indexOf("twice") !== -1) {
                return b.storedTotalCps;
            }
        }

        // Synergy upgrades: "+5% CPS per X" - harder to estimate
        if (desc.indexOf("synergy") !== -1 || desc.indexOf("+5%") !== -1) {
            return Game.cookiesPs * 0.05; // Rough estimate
        }

        // Cookie upgrades: "+X% CPS"
        var pctMatch = desc.match(/\+(\d+)%/);
        if (pctMatch) {
            return Game.cookiesPs * parseInt(pctMatch[1]) / 100;
        }

        return 0; // Can't estimate, will use fallback logic
    },

    _buyAffordableCheapUpgrades: function(cookies, cps) {
        // Buy any affordable upgrade that costs less than 1 minute of CPS
        // This catches eggs, holiday cookies, and other small upgrades
        var threshold = cps * 60;
        for (var i = 0; i < Game.UpgradesInStore.length; i++) {
            var u = Game.UpgradesInStore[i];
            if (u.bought || !u.canBuy()) continue;
            if (u.basePrice <= threshold) {
                u.buy();
                CookieCheater.stats.upgradesBought++;
                CookieCheater.log("purchaser", "buy_cheap_upgrade", u.name);
                this._lastPurchaseTime = Date.now();
                return;
            }
        }
    }
};
