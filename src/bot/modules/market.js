// Stock Market minigame — FULL CHEAT MODE
// Reads HIDDEN game state: mode (0-5), duration (ticks left in mode),
// resting value, overhead, market cap — data normal players can't see.
// Uses this to make risk-free trades: only buy when guaranteed to rise,
// only sell when decline is confirmed. The goal is PROFIT, never losses.
//
// Hidden data accessed:
//   g.mode  — 0=Stable, 1=Slow Rise, 2=Slow Fall, 3=Fast Rise, 4=Fast Fall, 5=Chaotic
//   g.dur   — ticks remaining in current mode
//   g.d     — delta (price change per tick)
//   g.val   — current price
//   g.stock — shares owned
//   M.brokers  — broker count (reduces overhead)
//   M.offices[M.officeLevel] — office level (more warehouse space)

CookieCheater.modules.market = {
    // Track our average buy prices to ensure we only sell at profit
    _positions: {}, // { goodId: { qty: N, totalCost: X } }
    _initialized: false,

    tick: function() {
        if (!CookieCheater.config.market_enabled) return;
        if (!CookieCheater.throttle("market", 5000)) return;

        var bank = Game.ObjectsById[5];
        if (!bank || !bank.minigame) return;

        // On first tick, rebuild positions from game state
        // This handles page reload / re-injection gracefully
        if (!this._initialized) {
            this._rebuildPositions(bank.minigame);
            this._initialized = true;
        }
        var M = bank.minigame;

        var brokers = M.brokers || 0;
        var overhead = 0.2 * Math.pow(0.95, brokers);
        var bankLevel = bank.level || 1;

        // Upgrade office (more warehouse space, loan slots)
        this._upgradeOffice(M);

        // Hire brokers (reduces overhead)
        this._hireBrokers(M, overhead);

        // Analyze each good with full hidden data
        for (var i = 0; i < M.goodsById.length; i++) {
            var g = M.goodsById[i];

            // Check if good is visible/unlocked
            var el = document.getElementById('bankGood-' + g.id);
            var hidden = el ? el.style.display === 'none' : (g.id >= bank.amount);
            if (hidden) continue;

            var analysis = this._analyze(g, M, bankLevel, brokers, overhead);

            if (analysis.action === "buy") {
                this._executeBuy(M, g, analysis, overhead);
            } else if (analysis.action === "sell") {
                this._executeSell(M, g, analysis, overhead);
            }
        }
    },

    _analyze: function(g, M, bankLevel, brokers, overhead) {
        var val = g.val;
        var mode = g.mode;      // HIDDEN: market mode (0-5)
        var dur = g.dur;        // HIDDEN: ticks left in this mode
        var delta = g.d;        // HIDDEN: price change per tick
        var stock = g.stock || 0;
        var maxStock = M.getGoodMaxStock ? M.getGoodMaxStock(g) : 100;

        var restingVal = this._restingValue(g.id, bankLevel);
        var ratio = val / restingVal;
        var marketCap = 100 + 3 * Math.max(0, bankLevel - 1);

        var buyPrice = val * (1 + overhead);
        var sellPrice = val * (1 - overhead);

        // Score-based system: positive = buy, negative = sell
        var score = 0;
        var reasons = [];

        // === PRICE FLOOR / EXTREME VALUE ===
        if (val <= 1) {
            score += 60;
            reasons.push("AT FLOOR ($1) - literally can't go lower");
        } else if (val < 5) {
            score += 45;
            reasons.push("Near floor ($" + val.toFixed(2) + ") - game adds recovery boost");
        } else if (ratio < 0.2) {
            score += 40;
            reasons.push("Extreme discount (" + (ratio * 100).toFixed(0) + "% of resting $" + restingVal + ")");
        } else if (ratio < 0.4) {
            score += 28;
            reasons.push("Very cheap (" + (ratio * 100).toFixed(0) + "% of $" + restingVal + ")");
        } else if (ratio < 0.6) {
            score += 15;
            reasons.push("Below resting (" + (ratio * 100).toFixed(0) + "%)");
        } else if (val > marketCap) {
            score -= 35;
            reasons.push("Above market cap ($" + marketCap + ") - delta dampened");
        } else if (ratio > 2.0) {
            score -= 30;
            reasons.push("Extremely overvalued (" + (ratio * 100).toFixed(0) + "%)");
        } else if (ratio > 1.5) {
            score -= 20;
            reasons.push("Overvalued (" + (ratio * 100).toFixed(0) + "%)");
        }

        // === MODE ANALYSIS (THE CHEAT) ===
        switch (mode) {
            case 1: // Slow Rise — price going up
                if (dur > 200) {
                    score += 25;
                    reasons.push("SLOW RISE, long runway (" + dur + " ticks) - BUY ZONE");
                } else if (dur > 50) {
                    score += 15;
                    reasons.push("Slow Rise (" + dur + "t left)");
                } else {
                    score += 3;
                    reasons.push("Slow Rise ending (" + dur + "t) - be cautious");
                }
                break;

            case 3: // Fast Rise — dangerous, 30% crash/tick, 3% flip to Fast Fall
                if (ratio < 0.5) {
                    score += 10;
                    reasons.push("Fast Rise + cheap - worth the risk");
                } else if (ratio > 1.0) {
                    score -= 20;
                    reasons.push("Fast Rise + expensive - CRASH IMMINENT (30%/tick)");
                } else {
                    score -= 5;
                    reasons.push("Fast Rise (" + dur + "t) - unstable, 30% crash risk");
                }
                break;

            case 2: // Slow Fall — price going down
                if (dur > 200) {
                    score -= 22;
                    reasons.push("SLOW FALL, long decline (" + dur + "t) - AVOID");
                } else if (dur < 30) {
                    score += 10;
                    reasons.push("Slow Fall ending (" + dur + "t) - bottom forming");
                } else {
                    score -= 12;
                    reasons.push("Slow Fall (" + dur + "t) - still declining");
                }
                break;

            case 4: // Fast Fall — aggressive decline
                if (dur < 15) {
                    score += 18;
                    reasons.push("FAST FALL nearly done (" + dur + "t) - reversal imminent");
                } else if (dur < 40) {
                    score -= 18;
                    reasons.push("Fast Fall (" + dur + "t) - steep drop");
                } else {
                    score -= 30;
                    reasons.push("Fast Fall, deep plunge (" + dur + "t) - STAY AWAY");
                }
                break;

            case 5: // Chaotic — random +-5% swings
                if (dur < 15 && ratio < 0.5) {
                    score += 5;
                    reasons.push("Chaos ending (" + dur + "t) + cheap");
                } else {
                    score -= 12;
                    reasons.push("CHAOTIC (" + dur + "t) - unpredictable swings");
                }
                break;

            case 0: // Stable — low volatility
                if (ratio < 0.4) {
                    score += 12;
                    reasons.push("Stable + cheap - good accumulation zone");
                } else {
                    score += 0;
                    reasons.push("Stable (" + dur + "t) - flat");
                }
                break;
        }

        // === POSITION MANAGEMENT ===
        if (stock > 0) {
            var pos = this._positions[g.id];
            if (pos && pos.qty > 0) {
                var avgCost = pos.totalCost / pos.qty;
                var profitPct = (sellPrice - avgCost) / avgCost;

                if (profitPct > 0.5) {
                    score -= 35;
                    reasons.push("TAKE PROFIT: +" + (profitPct * 100).toFixed(1) + "% gain");
                } else if (profitPct > 0.2 && (mode === 2 || mode === 4 || mode === 5)) {
                    score -= 25;
                    reasons.push("Sell before decline: +" + (profitPct * 100).toFixed(1) + "% gain, mode turning bad");
                } else if (profitPct > 0.1 && mode === 4 && dur > 50) {
                    score -= 20;
                    reasons.push("Exit Fast Fall: +" + (profitPct * 100).toFixed(1) + "% while still positive");
                } else if (profitPct < -0.05 && (mode === 2 || mode === 4) && dur > 100) {
                    // Losing money AND mode is falling with long runway
                    // DON'T sell at a loss unless it's going to get much worse
                    if (profitPct < -0.15 && mode === 4 && dur > 200) {
                        score -= 15;
                        reasons.push("CUT LOSS: " + (profitPct * 100).toFixed(1) + "% in deep Fast Fall");
                    }
                    // Otherwise hold — don't realize losses
                } else if (mode === 1 && dur > 50) {
                    score += 12;
                    reasons.push("Hold: rising mode with " + dur + "t runway");
                }
            } else {
                // No tracked position — use ratio as fallback
                if (ratio > 1.5 && (mode === 2 || mode === 4)) {
                    score -= 25;
                    reasons.push("Overvalued + falling - sell");
                } else if (ratio > 2.0) {
                    score -= 30;
                    reasons.push("Extremely overvalued - sell");
                }
            }
        }

        // === CAPACITY CHECK ===
        if (stock >= maxStock && score > 0) {
            score = 0;
            reasons.push("Position full (" + stock + "/" + maxStock + ")");
        }

        // === HIGH OVERHEAD PENALTY ===
        if (overhead > 0.15 && score > 0 && score < 30) {
            score = Math.floor(score * 0.5);
            reasons.push("High overhead (" + (overhead * 100).toFixed(1) + "%) - needs bigger moves");
        }

        // === FINAL DECISION ===
        var action = "hold";
        if (stock > 0 && score < -15) {
            action = "sell";
        } else if (stock === 0 && score > 25) {
            action = "buy";
        } else if (stock > 0 && stock < maxStock && score > 35) {
            action = "buy"; // Add to position
        }

        return {
            action: action,
            score: score,
            reasons: reasons,
            val: val,
            ratio: ratio,
            mode: mode,
            dur: dur,
            stock: stock,
            maxStock: maxStock,
            restingVal: restingVal,
            buyPrice: buyPrice,
            sellPrice: sellPrice,
        };
    },

    _executeBuy: function(M, g, analysis, overhead) {
        var maxStock = analysis.maxStock;
        var currentStock = analysis.stock;
        var space = maxStock - currentStock;
        if (space <= 0) return;

        // Size position based on signal strength
        var pctOfMax;
        if (analysis.score >= 50) {
            pctOfMax = 0.5;  // Strong signal: buy 50% of capacity
        } else if (analysis.score >= 35) {
            pctOfMax = 0.25; // Moderate: 25%
        } else {
            pctOfMax = 0.1;  // Weak: 10%
        }

        var qty = Math.min(space, Math.max(1, Math.floor(maxStock * pctOfMax)));
        var totalCost = analysis.buyPrice * qty;

        // Never spend more than 10% of cookies on a single trade
        if (totalCost > Game.cookies * 0.1) {
            qty = Math.max(1, Math.floor((Game.cookies * 0.1) / analysis.buyPrice));
            totalCost = analysis.buyPrice * qty;
        }

        // Final affordability check
        if (totalCost > Game.cookies) return;
        if (qty <= 0) return;

        M.buyGood(g.id, qty);

        // Track position for profit calculation
        if (!this._positions[g.id]) {
            this._positions[g.id] = { qty: 0, totalCost: 0 };
        }
        this._positions[g.id].qty += qty;
        this._positions[g.id].totalCost += totalCost;

        var modeNames = ["Stable", "SlowRise", "SlowFall", "FastRise", "FastFall", "Chaotic"];
        CookieCheater.log("market", "BUY",
            g.symbol + " x" + qty +
            " @ $" + analysis.val.toFixed(2) +
            " | mode=" + modeNames[analysis.mode] + "(" + analysis.dur + "t)" +
            " | ratio=" + (analysis.ratio * 100).toFixed(0) + "%" +
            " | score=" + analysis.score +
            " | " + analysis.reasons[0]
        );
    },

    _executeSell: function(M, g, analysis, overhead) {
        var stock = analysis.stock;
        if (stock <= 0) return;

        // Check: would this sell be profitable?
        var pos = this._positions[g.id];
        if (pos && pos.qty > 0) {
            var avgCost = pos.totalCost / pos.qty;
            var sellRevenue = analysis.sellPrice;

            // NEVER sell at a loss unless score is extremely negative (deep trouble)
            if (sellRevenue < avgCost && analysis.score > -25) {
                CookieCheater.log("market", "HOLD",
                    g.symbol + " - would lose $" + (avgCost - sellRevenue).toFixed(2) +
                    "/share, holding for recovery"
                );
                return;
            }
        }

        M.sellGood(g.id, stock);

        // Log profit
        var profitStr = "";
        if (pos && pos.qty > 0) {
            var avgCost = pos.totalCost / pos.qty;
            var profit = (analysis.sellPrice - avgCost) * stock;
            var profitPct = ((analysis.sellPrice - avgCost) / avgCost * 100);
            profitStr = " | P/L=" + (profit > 0 ? "+" : "") + profit.toFixed(2) +
                        " (" + (profitPct > 0 ? "+" : "") + profitPct.toFixed(1) + "%)";
        }

        // Clear tracked position
        if (this._positions[g.id]) {
            var soldQty = Math.min(stock, this._positions[g.id].qty);
            var avgCost = this._positions[g.id].totalCost / this._positions[g.id].qty;
            this._positions[g.id].qty -= soldQty;
            this._positions[g.id].totalCost -= avgCost * soldQty;
            if (this._positions[g.id].qty <= 0) {
                delete this._positions[g.id];
            }
        }

        var modeNames = ["Stable", "SlowRise", "SlowFall", "FastRise", "FastFall", "Chaotic"];
        CookieCheater.log("market", "SELL",
            g.symbol + " x" + stock +
            " @ $" + analysis.val.toFixed(2) +
            " | mode=" + modeNames[analysis.mode] + "(" + analysis.dur + "t)" +
            profitStr +
            " | " + analysis.reasons[0]
        );
    },

    _upgradeOffice: function(M) {
        // Auto-upgrade office (costs cookies, not lumps)
        if (!CookieCheater.throttle("market_office", 120000)) return;
        if (!M.officeLevel || M.officeLevel >= 5) return;

        try {
            // Office upgrade button
            var cost = M.offices[M.officeLevel + 1] ? M.offices[M.officeLevel + 1].cost : null;
            if (cost && Game.cookies >= cost && cost < Game.cookies * 0.05) {
                M.upgradeOffice();
                CookieCheater.justify("market", "OFFICE_UPGRADE",
                    "Office level " + (M.officeLevel) + " — more warehouse space + loan slots");
            }
        } catch(e) {}
    },

    _hireBrokers: function(M, currentOverhead) {
        // Brokers reduce overhead: 20% * 0.95^brokers
        // Cost: $1200. Max: floor(grandmaCount/10) + grandmaLevel
        if (!CookieCheater.throttle("market_brokers", 60000)) return;

        var brokers = M.brokers || 0;
        // Broker cap from wiki
        var grandmas = Game.ObjectsById[1] ? Game.ObjectsById[1].amount : 0;
        var grandmaLevel = Game.ObjectsById[1] ? (Game.ObjectsById[1].level || 0) : 0;
        var maxBrokers = Math.floor(grandmas / 10) + grandmaLevel;
        if (brokers >= maxBrokers) return;
        if (brokers >= 100) return; // Hard cap for sanity
        if (currentOverhead < 0.02) return; // Already under 2%

        // Broker cost: Game.ObjectsById[5].minigame.brokersPrice
        // In practice it's around $1200 * (1 + brokers * 0.15)
        try {
            var cost = M.brokersPrice ? M.brokersPrice() : 1200;
            if (cost < Game.cookies * 0.01) { // Less than 1% of cookies
                M.hireBroker();
                CookieCheater.log("market", "hire_broker",
                    "Broker #" + (brokers + 1) +
                    " | overhead now " + (0.2 * Math.pow(0.95, brokers + 1) * 100).toFixed(1) + "%"
                );
            }
        } catch(e) {}
    },

    _rebuildPositions: function(M) {
        // Reconstruct position tracking from game state after page reload.
        // We don't know the exact buy price, so estimate from current value.
        // This means the first sell after reload might be slightly off,
        // but it's better than having no position data at all.
        for (var i = 0; i < M.goodsById.length; i++) {
            var g = M.goodsById[i];
            if (g.stock > 0 && !this._positions[g.id]) {
                // Assume we bought near current price (conservative estimate)
                var estimatedCost = g.val * g.stock * 1.1; // Add 10% margin of safety
                this._positions[g.id] = { qty: g.stock, totalCost: estimatedCost };
                CookieCheater.log("market", "rebuild", g.symbol + " x" + g.stock + " (estimated avg $" + (estimatedCost / g.stock).toFixed(2) + ")");
            }
        }
    },

    _restingValue: function(goodId, bankLevel) {
        return 10 * (goodId + 1) + Math.max(0, (bankLevel || 1) - 1);
    }
};
