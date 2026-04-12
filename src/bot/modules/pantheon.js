// ============================================================================
// PANTHEON - Spirit management + Godzamok combo execution
// ============================================================================
// Passive: Mokalsium (Diamond) + Jeremy (Ruby) + Muridal (Jade)
// Combo: Auto-swap Godzamok, sell buildings, burst-click, rebuy
//
// Godzamok Diamond: +1% click power per building sold for 10 seconds
// Selling 200 buildings = +200% click power ON TOP of Frenzy+CF combo

CookieCheater.modules.pantheon = {
    _lastSwapTime: 0,
    _godzamokSlotted: false,
    _comboLog: [],       // Combo history for DB/dashboard
    _comboLogMax: 50,
    _currentCombo: null, // Active combo tracking

    tick: function() {
        if (!CookieCheater.config.pantheon_enabled) return;
        if (!CookieCheater.throttle("pantheon", 2000)) return;

        var temple = Game.ObjectsById[6];
        if (!temple || !temple.minigame) return;
        var M = temple.minigame;
        if (!M.gods) return;

        var comboActive = CookieCheater._comboActive && CookieCheater._comboScore > 100;

        // Track combo lifecycle
        this._trackCombo(comboActive);

        if (comboActive && !this._godzamokSlotted) {
            this._slotGodzamok(M);
        } else if (!comboActive && this._godzamokSlotted) {
            this._slotPassive(M);
        } else if (!this._godzamokSlotted && Date.now() - this._lastSwapTime > 30000) {
            this._slotPassive(M);
        }

        this._exposeState(M);
    },

    // ============================
    // COMBO LIFECYCLE TRACKING
    // ============================
    _trackCombo: function(comboActive) {
        if (comboActive && !this._currentCombo) {
            // Combo just started
            this._currentCombo = {
                startTime: Date.now(),
                startCookies: Game.cookies,
                buffs: [],
                godzamokSold: 0,
                peakMultiplier: 1,
            };

            // Capture active buffs
            for (var name in Game.buffs) {
                var buff = Game.buffs[name];
                this._currentCombo.buffs.push({
                    name: name,
                    multCpS: buff.multCpS || 1,
                    multClick: buff.multClick || 1,
                    time: Math.ceil((buff.time || 0) / (Game.fps || 30)),
                });
            }
            this._currentCombo.peakMultiplier = CookieCheater._comboScore || 1;

        } else if (comboActive && this._currentCombo) {
            // Combo ongoing — update peak
            var score = CookieCheater._comboScore || 1;
            if (score > this._currentCombo.peakMultiplier) {
                this._currentCombo.peakMultiplier = score;
            }

        } else if (!comboActive && this._currentCombo) {
            // Combo just ended — record it
            var combo = this._currentCombo;
            combo.endTime = Date.now();
            combo.endCookies = Game.cookies;
            combo.duration = Math.round((combo.endTime - combo.startTime) / 1000);
            combo.cookiesGained = combo.endCookies - combo.startCookies;

            this._comboLog.push(combo);
            if (this._comboLog.length > this._comboLogMax) this._comboLog.shift();

            CookieCheater.justify("pantheon", "COMBO_END",
                "Combo lasted " + combo.duration + "s | " +
                "Peak x" + Math.round(combo.peakMultiplier).toLocaleString() + " | " +
                "Gained " + CookieCheater.modules.strategist._fmt(combo.cookiesGained) + " cookies | " +
                "Buffs: " + combo.buffs.map(function(b) { return b.name; }).join("+") +
                (combo.godzamokSold > 0 ? " | Godzamok sold " + combo.godzamokSold : ""));

            this._currentCombo = null;
        }
    },

    // ============================
    // GODZAMOK COMBO
    // ============================
    _slotGodzamok: function(M) {
        var godzamok = this._findGod(M, "ruin");
        if (!godzamok) return;

        try {
            M.slotGod(godzamok, 0);
            this._godzamokSlotted = true;
            this._lastSwapTime = Date.now();
            this._sellForGodzamok();
        } catch(e) {}
    },

    _sellForGodzamok: function() {
        // Only sell buildings that are CHEAP to rebuy.
        // Selling 200 Cursors at $5T each = $1Q to rebuy. If the combo
        // doesn't earn $1Q, we lose money. Only sell buildings whose
        // TOTAL rebuy cost < 10% of current cookies.
        var safe = [7]; // Never sell Wizard Towers (need magic)

        var totalSold = 0;
        var soldDetails = [];
        var cookies = Game.cookies;

        // Find buildings cheap enough to sell and rebuy
        for (var i = 0; i < Game.ObjectsById.length; i++) {
            if (safe.indexOf(i) !== -1) continue;
            var b = Game.ObjectsById[i];
            if (!b || b.locked || b.amount < 10) continue;

            // Check rebuy cost: selling N buildings then rebuying costs ~N * current_price
            // (price increases 15% per building, so rebuying is MORE expensive)
            // Only sell if rebuy cost for 50 buildings < 5% of bank
            var rebuyCost = 0;
            var price = b.price;
            var sellCount = Math.min(b.amount - 1, 50); // Cap at 50 per building type
            // Estimate rebuy cost (price * (1 + 1.15 + 1.15^2 + ... + 1.15^(n-1)))
            for (var j = 0; j < sellCount; j++) {
                rebuyCost += price * Math.pow(1.15, j);
            }

            if (rebuyCost > cookies * 0.05) {
                // Too expensive to rebuy — try fewer
                sellCount = 0;
                rebuyCost = 0;
                for (var j = 0; j < Math.min(b.amount - 1, 200); j++) {
                    var nextCost = price * Math.pow(1.15, j);
                    if (rebuyCost + nextCost > cookies * 0.05) break;
                    rebuyCost += nextCost;
                    sellCount = j + 1;
                }
            }

            if (sellCount < 5) continue; // Not worth the hassle

            b.sell(sellCount);
            totalSold += sellCount;
            soldDetails.push(b.name + " x" + sellCount);

            // Rebuy after 12s
            (function(buildingId, count) {
                setTimeout(function() {
                    var rb = Game.ObjectsById[buildingId];
                    rb.buy(count);
                    CookieCheater.justify("pantheon", "REBUY",
                        rb.name + " x" + count + " bulk rebuilt after combo");
                }, 12000);
            })(i, sellCount);
        }

        if (totalSold > 0) {
            if (this._currentCombo) this._currentCombo.godzamokSold = totalSold;
            CookieCheater.justify("pantheon", "GODZAMOK_SELL",
                "Sold " + totalSold + " buildings (+" + totalSold + "% click, 10s): " + soldDetails.join(", "));
        }
    },

    // ============================
    // PASSIVE SPIRITS
    // ============================
    _slotPassive: function(M) {
        var mokalsium = this._findGod(M, "asceticism") || this._findGod(M, "mother");
        var jeremy = this._findGod(M, "industry");
        var muridal = this._findGod(M, "labor");

        try {
            if (mokalsium) M.slotGod(mokalsium, 0);
            if (jeremy) M.slotGod(jeremy, 1);
            if (muridal) M.slotGod(muridal, 2);
        } catch(e) {}

        this._godzamokSlotted = false;
        this._lastSwapTime = Date.now();
    },

    // ============================
    // STATE EXPOSURE
    // ============================
    _exposeState: function(M) {
        var slots = ["Empty", "Empty", "Empty"];
        var slotNames = ["Diamond", "Ruby", "Jade"];
        try {
            for (var i = 0; i < 3; i++) {
                for (var key in M.gods) {
                    var g = M.gods[key];
                    if (g.slot === i) { slots[i] = g.name; break; }
                }
            }
        } catch(e) {}

        CookieCheater._pantheonInfo = {
            slots: slots.map(function(name, i) { return { slot: slotNames[i], spirit: name }; }),
            godzamokActive: this._godzamokSlotted,
            templeLevel: Game.ObjectsById[6] ? (Game.ObjectsById[6].level || 0) : 0,
            mode: this._godzamokSlotted ? "combo" : "passive",
            comboLog: this._comboLog,
            currentCombo: this._currentCombo,
        };
    },

    _findGod: function(M, key) {
        if (M.gods[key]) return M.gods[key];
        for (var k in M.gods) {
            var g = M.gods[k];
            if (g.name && g.name.toLowerCase().indexOf(key) !== -1) return g;
        }
        return null;
    }
};
