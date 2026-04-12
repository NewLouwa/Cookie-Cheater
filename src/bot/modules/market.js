// ============================================================================
// STOCK MARKET — Value Investor Strategy (from CookieTrading's Cookie Monster)
// ============================================================================
// Best-performing strategy: buys at extreme lows and floor recovery zones,
// holds until massive gains. Combined with advisor scoring for signal strength.
//
// Key mechanics exploited:
// - Floor recovery: price < $5 gets (5-price)/2 added EVERY tick (game-coded guarantee)
// - Resting value: prices gravitate toward 10*(id+1)+bankLevel-1
// - Mode visibility: we read the hidden mode (0-5) and duration
// - Net profit: accounts for DOUBLE overhead (buy AND sell side)
// - Expected delta: predicts price movement per tick from mode+floor+mean-reversion
//
// From CookieTrading's Cookie Monster v3.0 — the highest performing bot.
// ============================================================================

CookieCheater.modules.market = {
    _positions: {},     // { goodId: { qty, totalCost, avgPrice, entryMode, entryTick } }
    _initialized: false,
    _signals: {},       // { goodId: { signal, strength, score, reasons } } for dashboard
    _stats: { totalTrades: 0, wins: 0, losses: 0, totalPnL: 0 },
    _tradeLog: [],      // Structured trades for DB persistence
    _tradeLogMax: 200,

    _recordTrade: function(action, g, qty, price, analysis, oh, netPct, pnl) {
        this._tradeLog.push({
            time: Date.now(),
            action: action,
            good_id: g.id,
            symbol: g.symbol || g.name,
            quantity: qty,
            price: price,
            mode: analysis.mode,
            dur: analysis.dur,
            ratio: Math.round(analysis.ratio * 100) / 100,
            score: analysis.score,
            net_pct: Math.round((netPct || 0) * 1000) / 1000,
            pnl: Math.round((pnl || 0) * 100) / 100,
            reason: (analysis.reasons && analysis.reasons[0]) || "",
        });
        if (this._tradeLog.length > this._tradeLogMax) this._tradeLog.shift();
    },

    tick: function() {
        if (!CookieCheater.config.market_enabled) return;
        if (!CookieCheater.throttle("market", 5000)) return;

        var bank = Game.ObjectsById[5];
        if (!bank || !bank.minigame) return;
        var M = bank.minigame;

        if (!this._initialized) {
            this._rebuildPositions(M);
            this._initialized = true;
        }

        var brokers = M.brokers || 0;
        var oh = 0.2 * Math.pow(0.95, brokers);
        var bankLevel = bank.level || 1;

        this._upgradeOffice(M);
        this._hireBrokers(M, brokers);

        // Analyze + trade each good
        for (var i = 0; i < M.goodsById.length; i++) {
            var g = M.goodsById[i];
            var el = document.getElementById('bankGood-' + g.id);
            var hidden = el ? el.style.display === 'none' : (g.id >= bank.amount);
            if (hidden) continue;

            var analysis = this._analyzeGood(g, M, bankLevel, brokers, oh);
            this._signals[g.id] = analysis.signal;

            if (analysis.action === "buy") this._executeBuy(M, g, analysis, oh);
            else if (analysis.action === "sell") this._executeSell(M, g, analysis, oh);
        }

        this._exposeState(M, bankLevel, brokers, oh);
    },

    // ========================================================================
    // CORE ANALYSIS — Cookie Monster value strategy + advisor scoring
    // ========================================================================
    _analyzeGood: function(g, M, bankLevel, brokers, oh) {
        var val = g.val;
        var mode = g.mode;
        var dur = g.dur;
        var stock = g.stock || 0;
        var maxStock = M.getGoodMaxStock ? M.getGoodMaxStock(g) : 100;
        var rest = this._restingValue(g.id, bankLevel);
        var ratio = val / rest;
        var recovery = this._floorRecovery(val);
        var expDelta = this._expectedDelta(g, bankLevel);
        var hurdle = this._overheadHurdle(brokers);

        var score = 0;
        var reasons = [];
        var action = "hold";

        // === PRICE vs RESTING (strongest signal) ===
        if (val <= 1) {
            score += 50; reasons.push("AT FLOOR ($1) — can only go up");
        } else if (val < 5) {
            score += 40; reasons.push("Floor recovery active (+$" + recovery.toFixed(1) + "/tick guaranteed)");
        } else if (ratio < 0.15) {
            score += 35; reasons.push("Rock bottom (" + (ratio * 100).toFixed(0) + "% of $" + rest + ")");
        } else if (ratio < 0.3) {
            score += 25; reasons.push("Deep value (" + (ratio * 100).toFixed(0) + "% of $" + rest + ")");
        } else if (ratio < 0.5) {
            score += 12; reasons.push("Below resting (" + (ratio * 100).toFixed(0) + "%)");
        } else if (ratio > 2.0) {
            score -= 25; reasons.push("Extremely overvalued (" + (ratio * 100).toFixed(0) + "%)");
        } else if (ratio > 1.4) {
            score -= 15; reasons.push("Overvalued (" + (ratio * 100).toFixed(0) + "%)");
        }

        // === MODE (medium signal) ===
        var modeNames = ["Stable", "Slow Rise", "Slow Fall", "Fast Rise", "Fast Fall", "Chaotic"];
        switch (mode) {
            case 1: // Slow Rise
                if (dur > 200) { score += 20; reasons.push("Slow Rise, long runway (" + dur + "t)"); }
                else if (dur > 50) { score += 12; reasons.push("Slow Rise (" + dur + "t)"); }
                else { score += 3; reasons.push("Slow Rise ending (" + dur + "t)"); }
                break;
            case 3: // Fast Rise — 30% crash risk per tick
                if (ratio < 0.5) { score += 10; reasons.push("Fast Rise + cheap"); }
                else if (ratio > 1.0) { score -= 15; reasons.push("Fast Rise + expensive (crash risk 30%/tick)"); }
                else { score -= 5; reasons.push("Fast Rise unstable (" + dur + "t)"); }
                break;
            case 2: // Slow Fall
                if (dur > 200) { score -= 18; reasons.push("Slow Fall, long decline (" + dur + "t)"); }
                else if (dur < 30) { score += 8; reasons.push("Slow Fall ending — bottom forming"); }
                else { score -= 10; reasons.push("Slow Fall (" + dur + "t)"); }
                break;
            case 4: // Fast Fall
                if (dur < 15) { score += 15; reasons.push("Fast Fall ending — reversal imminent"); }
                else if (dur < 50) { score -= 15; reasons.push("Fast Fall (" + dur + "t)"); }
                else { score -= 25; reasons.push("Fast Fall deep plunge (" + dur + "t)"); }
                break;
            case 5: // Chaotic
                score -= 10; reasons.push("Chaotic (" + dur + "t)");
                break;
            case 0: // Stable
                if (ratio < 0.4) { score += 10; reasons.push("Stable + cheap — accumulation zone"); }
                break;
        }

        // === EXPECTED PRICE MOVEMENT ===
        if (expDelta > 2) {
            score += 8;
            reasons.push("Expected delta +" + expDelta.toFixed(1) + "/tick");
        } else if (expDelta < -3) {
            score -= 8;
            reasons.push("Expected delta " + expDelta.toFixed(1) + "/tick");
        }

        // === POSITION MANAGEMENT ===
        if (stock > 0) {
            var pos = this._positions[g.id];
            if (pos && pos.qty > 0) {
                var net = this._netProfit(pos.avgPrice, val, brokers);
                var be = this._breakeven(pos.avgPrice, brokers);
                var priceVsBe = val / be; // >1 = above breakeven = profitable

                reasons.push("Position: avg $" + pos.avgPrice.toFixed(2) + " BE $" + be.toFixed(2) + " net " + (net * 100).toFixed(1) + "%");

                if (net > 0.80) {
                    score -= 40; reasons.push("MASSIVE GAIN +" + (net * 100).toFixed(0) + "% net — SELL");
                } else if (ratio > 1.5 && net > 0.30) {
                    score -= 35; reasons.push("Target hit (" + (ratio * 100).toFixed(0) + "% resting), +" + (net * 100).toFixed(0) + "% net");
                } else if (net > 0 && mode === 1 && ratio < 1.3) {
                    score += 10; reasons.push("Riding Slow Rise above breakeven");
                } else if (net > 0 && (mode === 2 || mode === 4) && dur > 30) {
                    score -= 20; reasons.push("Exit " + modeNames[mode] + " while profitable");
                } else if (net < 0 && mode === 1 && dur > 100) {
                    score += 5; reasons.push("Underwater but Slow Rise with " + dur + "t runway — hold for recovery");
                } else if (net < 0 && (mode === 2 || mode === 4) && dur > 100) {
                    // Deep underwater in falling mode — consider cutting loss
                    if (net < -0.30) {
                        score -= 15; reasons.push("Deep loss " + (net * 100).toFixed(0) + "% in " + modeNames[mode] + " — stop loss");
                    } else {
                        score -= 5; reasons.push("Underwater " + (net * 100).toFixed(0) + "% in decline — watching");
                    }
                } else if (net < 0 && mode === 0) {
                    score += 3; reasons.push("Underwater but Stable mode — patient hold");
                }
            }
        }

        // === CAPACITY CHECK ===
        if (stock >= maxStock && score > 0) { score = 0; reasons.push("Position full"); }

        // === OVERHEAD DRAG ===
        // With high overhead, only extreme bargains are worth buying
        if (stock === 0 && oh > 0.10 && score > 0) {
            var hurdlePct = Math.round(this._overheadHurdle(brokers) * 100);
            if (score < 35) {
                score = Math.floor(score * 0.4);
                reasons.push("High overhead " + (oh * 100).toFixed(1) + "% (need +" + hurdlePct + "% to break even) — suppressed");
            } else {
                reasons.push("High overhead " + (oh * 100).toFixed(1) + "% but strong signal");
            }
        }

        // === COOKIE BUDGET ===
        if (stock === 0 && score > 0) {
            var buyCost = val * (1 + oh);
            if (buyCost > Game.cookies * 0.1) {
                score = Math.min(score, 5);
                reasons.push("Can't afford meaningful position");
            }
        }

        // === DECISION ===
        // Value investor thresholds — scale with overhead
        // With 13% overhead you need ~30% price rise to break even
        // Only buy when the signal is MUCH stronger than the overhead hurdle
        var hurdle = this._overheadHurdle(Game.ObjectsById[5].minigame ? (Game.ObjectsById[5].minigame.brokers || 0) : 0);
        var buyThreshold = oh > 0.10 ? 35 : oh > 0.05 ? 30 : 25; // Stricter with high overhead

        if (stock > 0 && score < -15) action = "sell";
        else if (stock === 0 && score > buyThreshold) action = "buy";

        // Signal for dashboard
        var signal, strength;
        if (stock > 0) {
            if (score < -20) { signal = "SELL"; strength = "strong"; }
            else if (score < -8) { signal = "SELL"; strength = "moderate"; }
            else if (score > 15) { signal = "HOLD"; strength = "strong"; }
            else { signal = "HOLD"; strength = "weak"; }
        } else {
            if (score > 35) { signal = "BUY"; strength = "strong"; }
            else if (score > 18) { signal = "BUY"; strength = "moderate"; }
            else if (score > 8) { signal = "BUY"; strength = "weak"; }
            else { signal = "WAIT"; strength = ""; }
        }

        return {
            action: action,
            score: score,
            reasons: reasons,
            signal: { signal: signal, strength: strength, score: score, reasons: reasons },
            val: val, ratio: ratio, mode: mode, dur: dur,
            stock: stock, maxStock: maxStock, rest: rest,
            expDelta: expDelta, recovery: recovery,
            netPct: stock > 0 && this._positions[g.id] ? this._netProfit(this._positions[g.id].avgPrice, val, brokers) : 0,
            breakeven: stock > 0 && this._positions[g.id] ? this._breakeven(this._positions[g.id].avgPrice, brokers) : 0,
        };
    },

    // ========================================================================
    // EXECUTION
    // ========================================================================
    _executeBuy: function(M, g, analysis, oh) {
        var maxStock = analysis.maxStock;
        var space = maxStock - analysis.stock;
        if (space <= 0) return;

        // Cookie Monster sizing: full capacity at floor/extreme, 50% at deep value
        var qty;
        if (analysis.score >= 40) qty = Math.min(space, maxStock);
        else if (analysis.score >= 30) qty = Math.min(space, Math.ceil(maxStock * 0.5));
        else qty = Math.min(space, Math.ceil(maxStock * 0.25));

        var cost = analysis.val * qty * (1 + oh);
        if (cost > Game.cookies * 0.1) {
            qty = Math.max(1, Math.floor((Game.cookies * 0.1) / (analysis.val * (1 + oh))));
            cost = analysis.val * qty * (1 + oh);
        }
        if (cost > Game.cookies || qty <= 0) return;

        M.buyGood(g.id, qty);

        // Track position using RAW price (not including overhead)
        // Overhead will be calculated in _netProfit using broker count
        if (!this._positions[g.id]) this._positions[g.id] = { qty: 0, totalCost: 0, avgPrice: 0, entryMode: analysis.mode };
        this._positions[g.id].qty += qty;
        this._positions[g.id].totalCost += analysis.val * qty; // RAW price, no overhead
        this._positions[g.id].avgPrice = this._positions[g.id].totalCost / this._positions[g.id].qty;

        this._stats.totalTrades++;
        this._recordTrade("buy", g, qty, analysis.val, analysis, oh, 0, 0);

        var modeNames = ["Stable", "SlowRise", "SlowFall", "FastRise", "FastFall", "Chaotic"];
        CookieCheater.justify("market", "BUY",
            g.symbol + " x" + qty + " @ $" + analysis.val.toFixed(2) +
            " | " + modeNames[analysis.mode] + "(" + analysis.dur + "t)" +
            " | " + (analysis.ratio * 100).toFixed(0) + "% of resting" +
            " | score=" + analysis.score +
            (analysis.recovery > 0 ? " | FLOOR BOOST +$" + analysis.recovery.toFixed(1) + "/tick" : "") +
            " | " + analysis.reasons[0]);
    },

    _executeSell: function(M, g, analysis, oh) {
        var stock = analysis.stock;
        if (stock <= 0) return;

        // Check if this sell would be profitable (using broker count for proper overhead calc)
        var brokers = M.brokers || 0;
        var pos = this._positions[g.id];
        if (pos && pos.qty > 0) {
            var net = this._netProfit(pos.avgPrice, analysis.val, brokers);
            if (net < 0 && analysis.score > -25) return; // Don't sell at a loss unless stop-loss
        }

        M.sellGood(g.id, stock);

        // Calculate P/L
        var tradeNet = 0, tradePnl = 0;
        var pnlStr = "";
        if (pos && pos.qty > 0) {
            tradeNet = this._netProfit(pos.avgPrice, analysis.val, brokers);
            // Actual P/L: what we receive minus what we paid (both with overhead)
            var received = analysis.val * stock * (1 - oh);
            var paid = pos.avgPrice * stock * (1 + oh); // avgPrice is RAW, add buy overhead
            tradePnl = received - paid;
            pnlStr = " | P/L " + (tradePnl > 0 ? "+" : "") + tradePnl.toFixed(0) + " (" + (tradeNet > 0 ? "+" : "") + (tradeNet * 100).toFixed(1) + "% net)";
            this._stats.totalPnL += tradePnl;
            if (tradePnl > 0) this._stats.wins++; else this._stats.losses++;
        }
        this._stats.totalTrades++;
        this._recordTrade("sell", g, stock, analysis.val, analysis, oh, tradeNet, tradePnl);

        if (this._positions[g.id]) delete this._positions[g.id];

        var modeNames = ["Stable", "SlowRise", "SlowFall", "FastRise", "FastFall", "Chaotic"];
        CookieCheater.justify("market", "SELL",
            g.symbol + " x" + stock + " @ $" + analysis.val.toFixed(2) +
            " | " + modeNames[analysis.mode] + "(" + analysis.dur + "t)" +
            pnlStr + " | " + analysis.reasons[0]);
    },

    // ========================================================================
    // HELPER FUNCTIONS (from CookieTrading)
    // ========================================================================
    _restingValue: function(goodId, bankLevel) {
        return 10 * (goodId + 1) + Math.max(0, (bankLevel || 1) - 1);
    },

    _floorRecovery: function(price) {
        // Game adds (5-price)/2 per tick when price < $5. Guaranteed.
        return price < 5 ? (5 - price) / 2 : 0;
    },

    _expectedDelta: function(g, bankLevel) {
        // Predict price movement per tick from mode + floor + mean reversion
        var mode = g.mode;
        var base = {0: 0, 1: 0.5, 2: -0.5, 3: 2.9, 4: -5.0, 5: 0}[mode] || 0;
        // Fast Rise: 70% chance +5, 30% crash = 0.7*5 + 0.3*(-2) = 2.9
        base += this._floorRecovery(g.val);
        var rest = this._restingValue(g.id, bankLevel);
        if (rest > 0) base += (rest - g.val) * 0.01; // Mean reversion 1%/tick
        return base;
    },

    _netProfit: function(buyAvgRaw, sellPriceRaw, brokers) {
        // Net profit % after overhead on BOTH buy and sell sides
        // buyAvgRaw and sellPriceRaw are RAW prices (without overhead)
        // brokers is the broker COUNT (used to calculate overhead)
        var oh = 0.2 * Math.pow(0.95, brokers);
        var actualBuy = buyAvgRaw * (1 + oh);   // What we paid per share
        var actualSell = sellPriceRaw * (1 - oh); // What we receive per share
        return actualBuy > 0 ? (actualSell - actualBuy) / actualBuy : 0;
    },

    _breakeven: function(buyAvg, brokers) {
        var oh = 0.2 * Math.pow(0.95, brokers);
        var denom = 1 - oh;
        return denom > 0 ? buyAvg * (1 + oh) / denom : buyAvg * 2;
    },

    _overheadHurdle: function(brokers) {
        var oh = 0.2 * Math.pow(0.95, brokers);
        var denom = 1 - oh;
        return denom > 0 ? ((1 + oh) / denom - 1) : 1;
    },

    // ========================================================================
    // INFRASTRUCTURE
    // ========================================================================
    _rebuildPositions: function(M) {
        for (var i = 0; i < M.goodsById.length; i++) {
            var g = M.goodsById[i];
            if (g.stock > 0 && !this._positions[g.id]) {
                // Estimate avg buy price slightly above current (conservative)
                var estAvg = g.val * 1.05; // Assume we bought 5% higher than current
                this._positions[g.id] = { qty: g.stock, totalCost: estAvg * g.stock, avgPrice: estAvg, entryMode: g.mode };
                CookieCheater.log("market", "rebuild", g.symbol + " x" + g.stock + " (est raw avg $" + estAvg.toFixed(2) + ")");
            }
        }
    },

    _upgradeOffice: function(M) {
        if (!CookieCheater.throttle("market_office", 120000)) return;
        try {
            if (M.officeLevel >= 5) return;
            var nextOffice = M.offices[M.officeLevel + 1];
            if (nextOffice && nextOffice.cost && Game.cookies >= nextOffice.cost && nextOffice.cost < Game.cookies * 0.05) {
                M.upgradeOffice();
                CookieCheater.justify("market", "OFFICE", "Upgraded office to level " + (M.officeLevel) + " — more warehouse space");
            }
        } catch (e) {}
    },

    _hireBrokers: function(M, brokers) {
        if (!CookieCheater.throttle("market_brokers", 60000)) return;
        var grandmas = Game.ObjectsById[1] ? Game.ObjectsById[1].amount : 0;
        var grandmaLevel = Game.ObjectsById[1] ? (Game.ObjectsById[1].level || 0) : 0;
        var maxBrokers = Math.floor(grandmas / 10) + grandmaLevel;
        if (brokers >= maxBrokers || brokers >= 100) return;
        var oh = 0.2 * Math.pow(0.95, brokers);
        if (oh < 0.02) return;
        try {
            var cost = M.brokersPrice ? M.brokersPrice() : 1200;
            if (cost < Game.cookies * 0.01) {
                M.hireBroker();
                CookieCheater.justify("market", "BROKER",
                    "Hired broker #" + (brokers + 1) + " — overhead " + (0.2 * Math.pow(0.95, brokers + 1) * 100).toFixed(1) + "%");
            }
        } catch (e) {}
    },

    // ========================================================================
    // LOAN ANALYSIS (propose to user, never auto-take)
    // ========================================================================
    _analyzeLoan: function(M) {
        if (!M.loans || !M.offices) return null;

        var loans = [];
        // Loan data from wiki
        var loanDefs = [
            { id: 1, name: "Modest Loan", boost: 0.50, boostDur: "2 hours", penalty: 0.75, penaltyDur: "4 hours", downpayment: 0.20, note: "Mediocre — 4h of -75% CPS penalty is brutal" },
            { id: 2, name: "Pawnshop Loan", boost: 1.00, boostDur: "40 seconds", penalty: 0.90, penaltyDur: "40 minutes", downpayment: 0.40, note: "BEST for combos — +100% CPS for 40s, time it with Frenzy+Click Frenzy" },
            { id: 3, name: "Retirement Loan", boost: 0.20, boostDur: "2 days", penalty: 0.20, penaltyDur: "5 days", downpayment: 0.50, note: "Safe passive play — +20% for 2 days, small -20% penalty after" },
        ];

        for (var i = 0; i < loanDefs.length; i++) {
            var def = loanDefs[i];
            // Check if loan slot is available (requires office level)
            // Loan 1: office 2+, Loan 2: office 4+, Loan 3: office 5+
            var minOffice = [0, 2, 4, 5][def.id] || 99;
            var available = (M.officeLevel || 0) >= minOffice;

            // Check if loan is already active
            var active = false;
            try {
                var el = document.getElementById('bankLoan' + def.id);
                if (el && el.style.display !== 'none') active = true;
            } catch(e) {}

            var cps = Game.cookiesPs;
            var boostValue = cps * def.boost;
            var downpaymentCost = Game.cookies * def.downpayment;

            loans.push({
                id: def.id,
                name: def.name,
                available: available && !active,
                active: active,
                boost: "+" + (def.boost * 100) + "% CPS",
                boostValue: boostValue,
                boostDur: def.boostDur,
                penalty: "-" + (def.penalty * 100) + "% CPS",
                penaltyDur: def.penaltyDur,
                downpayment: (def.downpayment * 100) + "% of bank (" + this._fmt(downpaymentCost) + ")",
                note: def.note,
                recommendation: this._loanRecommendation(def, cps),
            });
        }

        return loans;
    },

    _loanRecommendation: function(def, cps) {
        // Pawnshop during active combo = strongly recommended
        if (def.id === 2 && CookieCheater._comboActive) {
            return { action: "TAKE NOW", reason: "Combo active! +100% CPS for 40s during combo = massive gains" };
        }
        // Retirement for passive play = moderate recommendation
        if (def.id === 3) {
            return { action: "Consider", reason: "+20% CPS for 2 days. Penalty is mild (-20% for 5 days). Good for overnight." };
        }
        // Modest = generally avoid
        if (def.id === 1) {
            return { action: "Avoid", reason: "-75% CPS for 4 hours is devastating. Only take if you need a short boost and can handle the penalty." };
        }
        return { action: "Wait", reason: "No active combo. Best to wait for Frenzy+Click Frenzy before taking Pawnshop." };
    },

    _fmt: function(n) {
        if (n < 1e6) return Math.round(n).toLocaleString();
        if (n < 1e9) return (n / 1e6).toFixed(1) + "M";
        if (n < 1e12) return (n / 1e9).toFixed(1) + "B";
        return (n / 1e12).toFixed(1) + "T";
    },

    _exposeState: function(M, bankLevel, brokers, oh) {
        var goods = [];
        for (var i = 0; i < M.goodsById.length; i++) {
            var g = M.goodsById[i];
            var el = document.getElementById('bankGood-' + g.id);
            var hidden = el ? el.style.display === 'none' : (g.id >= Game.ObjectsById[5].amount);
            if (hidden) continue;
            var rest = this._restingValue(g.id, bankLevel);
            var sig = this._signals[g.id] || {};
            var pos = this._positions[g.id];
            goods.push({
                id: g.id, name: g.name, symbol: g.symbol,
                val: Math.round(g.val * 100) / 100,
                delta: Math.round(g.d * 1000) / 1000,
                mode: ["Stable", "Slow Rise", "Slow Fall", "Fast Rise", "Fast Fall", "Chaotic"][g.mode],
                modeId: g.mode, dur: g.dur,
                stock: g.stock || 0,
                maxStock: M.getGoodMaxStock ? M.getGoodMaxStock(g) : 100,
                restingVal: rest,
                ratio: Math.round((g.val / rest) * 100),
                expDelta: Math.round(this._expectedDelta(g, bankLevel) * 10) / 10,
                signal: sig.signal || "WAIT",
                strength: sig.strength || "",
                score: sig.score || 0,
                reasons: sig.reasons || [],
                // Position info
                avgPrice: pos ? Math.round(pos.avgPrice * 100) / 100 : null,
                netPct: pos ? Math.round(this._netProfit(pos.avgPrice, g.val, brokers) * 1000) / 10 : null,
                breakeven: pos ? Math.round(this._breakeven(pos.avgPrice, brokers) * 100) / 100 : null,
            });
        }
        CookieCheater._marketInfo = {
            goods: goods,
            brokers: brokers,
            overhead: Math.round(oh * 10000) / 100,
            hurdle: Math.round(this._overheadHurdle(brokers) * 10000) / 100,
            profit: Math.round((M.profit || 0) * 100) / 100,
            officeLevel: M.officeLevel || 0,
            stats: this._stats,
            tradeLog: this._tradeLog,
            loans: this._analyzeLoan(M),
        };
    },
};
