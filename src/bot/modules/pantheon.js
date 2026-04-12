// Pantheon minigame with Godzamok combo support
//
// Spirits and slot power (Diamond > Ruby > Jade):
//   Mokalsium (asceticism) - Milk +10/5/3% more powerful
//   Jeremy (industry)     - Buildings +10/5/3% more productive
//   Godzamok (ruin)       - +1/0.5/0.25% click power per building sold (10s)
//   Muridal (labor)       - +15/10/5% cursor/click CPS
//   Skruuia (scorn)       - Wrinklers spawn 150/100/50% faster, digest 15/10/5% more
//   Cyclius (ages)        - CPS varies +-15% over day cycle
//   Dotjeiess (order)     - Buildings 7/5/2% cheaper
//   Holobore (decadence)  - +15/10/5% base CPS (unslots on GC click)
//   Selebrak (festivity)  - Season-specific bonuses
//   Vomitrax (labor)      - Golden cookie effects +7/5/2% duration
//
// Strategy:
//   Passive play: Mokalsium(Diamond) + Jeremy(Ruby) + Muridal(Jade)
//   Combo play:   Godzamok(Diamond) during click combo, swap back after
//   Wrinkler:     Skruuia(Diamond) when running full Grandmapocalypse

CookieCheater.modules.pantheon = {
    _lastSwapTime: 0,
    _godzamokSlotted: false,

    tick: function() {
        if (!CookieCheater.config.pantheon_enabled) return;
        if (!CookieCheater.throttle("pantheon", 2000)) return;

        var temple = Game.ObjectsById[6];
        if (!temple || !temple.minigame) return;
        var M = temple.minigame;
        if (!M.gods) return;

        // During click combo: swap Godzamok into Diamond for massive click boost
        var comboActive = CookieCheater._comboActive && CookieCheater._comboScore > 100;

        if (comboActive && !this._godzamokSlotted) {
            this._slotGodzamok(M);
        } else if (!comboActive && this._godzamokSlotted) {
            this._slotPassive(M);
        } else if (!this._godzamokSlotted && Date.now() - this._lastSwapTime > 30000) {
            // Ensure passive setup is correct (check every 30s)
            this._slotPassive(M);
        }
    },

    _slotGodzamok: function(M) {
        var godzamok = this._findGod(M, "ruin");
        if (!godzamok) return;

        try {
            M.slotGod(godzamok, 0); // Diamond slot
            this._godzamokSlotted = true;
            this._lastSwapTime = Date.now();

            // Sell and rebuy cheapest buildings for Godzamok boost
            // Each building sold = +1% click power for 10 seconds (Diamond)
            this._sellForGodzamok();

            CookieCheater.log("pantheon", "GODZAMOK", "Slotted Godzamok + sold buildings for combo!");
        } catch(e) {}
    },

    _sellForGodzamok: function() {
        // Sell cheap buildings for Godzamok click buff
        // +1% click power per building sold (Diamond slot) for 10 seconds
        // Use KB targets if available, otherwise default
        var targets = CookieCheater.KB && CookieCheater.KB.combos
            ? CookieCheater.KB.combos.godzamokTargets
            : [0, 2, 3, 4]; // Cursor, Farm, Mine, Factory
        var safe = CookieCheater.KB && CookieCheater.KB.combos
            ? CookieCheater.KB.combos.godzamokSafe
            : [7]; // Never sell Wizard Towers

        var totalSold = 0;
        for (var t = 0; t < targets.length; t++) {
            if (safe.indexOf(targets[t]) !== -1) continue;
            var b = Game.ObjectsById[targets[t]];
            if (!b || b.amount < 10) continue;

            // Keep at least 1 of each building
            var sellCount = Math.min(b.amount - 1, 200);
            if (sellCount <= 0) continue;

            // Sell in bulk
            b.sell(sellCount);
            totalSold += sellCount;

            // Schedule rebuy after combo expires (10s buff + 2s safety)
            (function(buildingId, count) {
                setTimeout(function() {
                    var rb = Game.ObjectsById[buildingId];
                    for (var r = 0; r < count; r++) {
                        if (Game.cookies >= rb.price) rb.buy(1);
                    }
                    CookieCheater.justify("pantheon", "REBUY", rb.name + " x" + count + " after Godzamok combo");
                }, 12000);
            })(targets[t], sellCount);
        }

        if (totalSold > 0) {
            CookieCheater.justify("pantheon", "GODZAMOK_SELL",
                "Sold " + totalSold + " buildings for +" + totalSold + "% click power (10s)");
        }
    },

    _slotPassive: function(M) {
        // Default passive setup: Mokalsium + Jeremy + Muridal
        var mokalsium = this._findGod(M, "asceticism") || this._findGod(M, "mother");
        var jeremy = this._findGod(M, "industry");
        var muridal = this._findGod(M, "labor");

        try {
            if (mokalsium) M.slotGod(mokalsium, 0); // Diamond
            if (jeremy) M.slotGod(jeremy, 1);       // Ruby
            if (muridal) M.slotGod(muridal, 2);      // Jade
        } catch(e) {}

        this._godzamokSlotted = false;
        this._lastSwapTime = Date.now();
    },

    _findGod: function(M, key) {
        // Search by key or by name substring
        if (M.gods[key]) return M.gods[key];
        for (var k in M.gods) {
            var g = M.gods[k];
            if (g.name && g.name.toLowerCase().indexOf(key) !== -1) return g;
        }
        return null;
    }
};
