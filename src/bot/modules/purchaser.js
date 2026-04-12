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
            this.currentPhase = "saving for " + saveTarget.name + " (" + Math.ceil((saveTarget.price - cookies) / cps) + "s)";
            return;
        }

        // Buy the best affordable upgrade if it beats best affordable building
        if (bestUpgrade && bestUpgrade.affordable) {
            var buildingPayback = bestAffordableBuilding ? bestAffordableBuilding.payback : Infinity;
            if (bestUpgrade.payback <= buildingPayback) {
                bestUpgrade.ref.buy();
                CookieCheater.stats.upgradesBought++;
                CookieCheater.log("purchaser", "buy_upgrade", bestUpgrade.name + " ($" + this._fmt(bestUpgrade.price) + ")");
                this._lastPurchaseTime = Date.now();
                this.currentPhase = "bought upgrade: " + bestUpgrade.name;
                return;
            }
        }

        // Buy the best affordable building
        if (bestAffordableBuilding) {
            bestAffordableBuilding.ref.buy();
            CookieCheater.stats.buildingsBought++;
            CookieCheater.log("purchaser", "buy_building", bestAffordableBuilding.name + " #" + bestAffordableBuilding.ref.amount + " ($" + this._fmt(bestAffordableBuilding.price) + ")");
            this._lastPurchaseTime = Date.now();
            this.currentPhase = "bought: " + bestAffordableBuilding.name;
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
        var milestones = [1, 5, 25, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500];
        var amount = building.amount;
        for (var i = 0; i < milestones.length; i++) {
            var m = milestones[i];
            if (amount < m && amount >= m - 3) return 2.0;
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
            var deltaCps = this._estimateUpgradeDeltaCps(u, cps);

            var payback;
            if (deltaCps > 0) {
                payback = price / deltaCps;
            } else {
                // Non-CPS upgrade: buy if cheap enough (scaled by game phase)
                var phase = CookieCheater.getPhase();
                var maxMinutes = phase === "early" ? 2 : phase === "mid" ? 5 : 10;
                var minutesCost = price / Math.max(cps * 60, 0.001);
                if (minutesCost <= maxMinutes) {
                    payback = price / Math.max(cps * 0.1, 0.001);
                } else {
                    continue;
                }
            }

            if (payback < bestPayback) {
                bestPayback = payback;
                best = { ref: u, name: u.name, price: price, payback: payback, affordable: u.canBuy() };
            }
        }

        return best;
    },

    _estimateUpgradeDeltaCps: function(upgrade, cps) {
        // Building-tied upgrades (doubles that building's output)
        if (upgrade.buildingTie1 && upgrade.buildingTie1.storedTotalCps > 0) {
            return upgrade.buildingTie1.storedTotalCps;
        }
        if (upgrade.buildingTie && upgrade.buildingTie.storedTotalCps > 0) {
            return upgrade.buildingTie.storedTotalCps;
        }

        // Parse description for "twice as efficient"
        var desc = upgrade.desc || "";
        if (desc.indexOf("twice") !== -1) {
            for (var i = 0; i < Game.ObjectsById.length; i++) {
                var b = Game.ObjectsById[i];
                if (b.locked) continue;
                if ((b.plural && desc.indexOf(b.plural) !== -1) ||
                    desc.indexOf(b.name) !== -1) {
                    return b.storedTotalCps;
                }
            }
        }

        // Synergy upgrades
        if (desc.indexOf("synergy") !== -1 || desc.indexOf("+5%") !== -1) {
            return cps * 0.05;
        }

        // Percentage-based cookie upgrades ("+X%")
        var pctMatch = desc.match(/\+(\d+)%/);
        if (pctMatch) {
            return cps * parseInt(pctMatch[1]) / 100;
        }

        // Kitten upgrades: huge multiplier based on milk
        if (desc.indexOf("milk") !== -1 && upgrade.name.indexOf("Kitten") !== -1) {
            return cps * 0.2; // Rough estimate: ~20% boost
        }

        return 0;
    },

    _buyAffordableCheapUpgrades: function(cookies, cps) {
        // Adaptive threshold: buy upgrades costing less than X seconds of CPS
        // Early game: 120s, Mid: 60s, Late: 30s
        var phase = CookieCheater.getPhase();
        var seconds = phase === "early" ? 120 : phase === "mid" ? 60 : 30;
        var threshold = cps * seconds;

        for (var i = 0; i < Game.UpgradesInStore.length; i++) {
            var u = Game.UpgradesInStore[i];
            if (u.bought || !u.canBuy()) continue;
            if (u.basePrice <= threshold) {
                u.buy();
                CookieCheater.stats.upgradesBought++;
                CookieCheater.log("purchaser", "buy_cheap_upgrade", u.name);
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
