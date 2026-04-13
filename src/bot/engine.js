// CookieCheater Bot Engine - Core harness
// All modules register into CookieCheater.modules and get called each logic tick.

var CookieCheater = window.CookieCheater = {
    running: false,
    config: {
        auto_click: true,
        clicks_per_frame: 15,
        click_only_during_buffs: false,
        max_payback_seconds: 600,
        save_for_upgrades: true,
        buy_upgrades_under_cps_minutes: 10.0,
        auto_pop_golden: true,
        auto_pop_reindeer: true,
        grandmapocalypse_strategy: "pledge",
        pop_wrinklers: true,
        wrinkler_min_feed_minutes: 30,
        auto_season_cycle: true,
        garden_enabled: true,
        pantheon_enabled: true,
        grimoire_enabled: true,
        market_enabled: true,
        auto_harvest_lumps: true,
        dragon_enabled: true,
    },

    modules: {},

    stats: {
        startTime: Date.now(),
        totalClicks: 0,
        goldenCookiesClicked: 0,
        buildingsBought: 0,
        upgradesBought: 0,
        ascensions: 0,
    },

    // Action log (circular buffer)
    _actionLog: [],
    _maxLogSize: 200,

    log: function(module, action, detail) {
        var entry = {
            time: Date.now(),
            module: module,
            action: action,
            detail: detail || ""
        };
        CookieCheater._actionLog.push(entry);
        if (CookieCheater._actionLog.length > CookieCheater._maxLogSize) {
            CookieCheater._actionLog.shift();
        }
    },

    getActionLog: function(limit) {
        var log = CookieCheater._actionLog;
        if (limit && limit < log.length) {
            return log.slice(log.length - limit);
        }
        return log;
    },

    // Throttle helper: returns true if enough time has passed since last call for this key
    _throttles: {},
    throttle: function(key, intervalMs) {
        var now = Date.now();
        if (!CookieCheater._throttles[key] || now - CookieCheater._throttles[key] >= intervalMs) {
            CookieCheater._throttles[key] = now;
            return true;
        }
        return false;
    },

    // Detect game phase based on CPS
    getPhase: function() {
        var cps = Game.cookiesPs;
        if (cps < 1000) return "early";
        if (cps < 1e9) return "mid";
        if (cps < 1e15) return "late";
        return "endgame";
    },

    // Lucky banking: keep enough cookies to maximize Lucky golden cookie payout
    // Lucky gives: min(900 * CPS, 15% of banked cookies)
    // To maximize: bank >= 6000 * CPS (so 15% of bank >= 900 * CPS)
    // During Frenzy (x7): need 6000 * 7 * CPS = 42000 * CPS
    getLuckyBank: function() {
        var cps = Game.cookiesPs;
        // Check if Frenzy is active (need higher bank during Frenzy for Lucky combo)
        var frenzyMult = 1;
        for (var name in Game.buffs) {
            if (Game.buffs[name].multCpS) frenzyMult = Math.max(frenzyMult, Game.buffs[name].multCpS);
        }
        return cps * 6000 * frenzyMult;
    },

    // Check if we should avoid spending cookies (to keep Lucky bank full)
    shouldSaveCookies: function() {
        if (CookieCheater.getPhase() === "early") return false; // Don't bank in early game
        return Game.cookies < CookieCheater.getLuckyBank();
    },

    // Check if any click-multiplier buff is active
    hasClickBuff: function() {
        for (var name in Game.buffs) {
            var buff = Game.buffs[name];
            if (buff.multClick && buff.multClick > 1) return true;
        }
        return false;
    },

    // Check if any CPS multiplier buff is active (Frenzy, etc.)
    hasCpsBuff: function() {
        for (var name in Game.buffs) {
            var buff = Game.buffs[name];
            if (buff.multCpS && buff.multCpS > 1) return true;
        }
        return false;
    },

    // Auto-close game popups that block the bot (One Mind warning, etc.)
    _closePopups: function() {
        // The game shows confirmation popups that freeze everything
        // Close them by clicking "No" (safe default) or dismiss
        try {
            var prompt = document.getElementById('promptContent');
            if (prompt && prompt.offsetParent !== null) {
                // Check if it's a dangerous popup (One Mind, Communal Brainsweep, Elder Pact)
                var text = prompt.innerText || '';
                if (text.indexOf('One mind') !== -1 || text.indexOf('Communal brainsweep') !== -1 || text.indexOf('Elder Pact') !== -1) {
                    // Grandmapocalypse trigger — click No if strategy is not "full"
                    if (CookieCheater.config.grandmapocalypse_strategy !== "full") {
                        Game.ClosePrompt();
                        CookieCheater.justify("engine", "POPUP_CLOSED", "Dismissed Grandmapocalypse popup (strategy: " + CookieCheater.config.grandmapocalypse_strategy + ")");
                        return;
                    }
                }
                // Any other popup — close it
                Game.ClosePrompt();
            }
        } catch(e) {}
    },

    // Main loop: called every game logic frame
    mainLoop: function() {
        if (!CookieCheater.running) return;
        // Handle blocking popups first
        CookieCheater._closePopups();
        for (var key in CookieCheater.modules) {
            try {
                CookieCheater.modules[key].tick();
            } catch(e) {
                // Don't let one module crash the whole bot
                if (CookieCheater.throttle('err_' + key, 10000)) {
                    console.error('[CookieCheater.' + key + ']', e);
                }
            }
        }
    },

    // Full status snapshot for the Python side
    getStatus: function() {
        var buildings = [];
        for (var i = 0; i < Game.ObjectsById.length; i++) {
            var b = Game.ObjectsById[i];
            buildings.push({
                id: i,
                name: b.name,
                amount: b.amount,
                price: b.price,
                totalCps: b.storedTotalCps,
                locked: b.locked ? true : false
            });
        }

        var buffs = [];
        for (var name in Game.buffs) {
            var buff = Game.buffs[name];
            buffs.push({
                name: name,
                maxTime: buff.maxTime,
                time: buff.time,
                multCpS: buff.multCpS || 1,
                multClick: buff.multClick || 1
            });
        }

        var upgradesAvailable = 0;
        for (var i = 0; i < Game.UpgradesInStore.length; i++) {
            if (Game.UpgradesInStore[i].canBuy()) upgradesAvailable++;
        }

        // Market data (hidden state exposed!)
        var market = null;
        var bank = Game.ObjectsById[5];
        if (bank && bank.minigame) {
            var M = bank.minigame;
            var modeNames = ["Stable", "Slow Rise", "Slow Fall", "Fast Rise", "Fast Fall", "Chaotic"];
            var brokers = M.brokers || 0;
            var overhead = 0.2 * Math.pow(0.95, brokers);
            var bankLevel = bank.level || 1;
            var goods = [];
            for (var mi = 0; mi < M.goodsById.length; mi++) {
                var mg = M.goodsById[mi];
                var el = document.getElementById('bankGood-' + mg.id);
                var mhidden = el ? el.style.display === 'none' : (mg.id >= bank.amount);
                if (mhidden) continue;
                var restVal = 10 * (mg.id + 1) + Math.max(0, bankLevel - 1);
                goods.push({
                    id: mg.id,
                    name: mg.name,
                    symbol: mg.symbol,
                    val: Math.round(mg.val * 100) / 100,
                    delta: Math.round(mg.d * 1000) / 1000,
                    mode: modeNames[mg.mode] || "Unknown",
                    modeId: mg.mode,
                    dur: mg.dur,
                    stock: mg.stock || 0,
                    maxStock: M.getGoodMaxStock ? M.getGoodMaxStock(mg) : 100,
                    restingVal: restVal,
                    ratio: Math.round((mg.val / restVal) * 100),
                    buyPrice: Math.round(mg.val * (1 + overhead) * 100) / 100,
                    sellPrice: Math.round(mg.val * (1 - overhead) * 100) / 100,
                });
            }
            market = {
                goods: goods,
                brokers: brokers,
                overhead: Math.round(overhead * 10000) / 100,
                profit: Math.round((M.profit || 0) * 100) / 100,
                officeLevel: M.officeLevel || 0,
                positions: CookieCheater.modules.market ? CookieCheater.modules.market._positions : {},
            };
        }

        return {
            cookies: Game.cookies,
            cookiesEarned: Game.cookiesEarned,
            cps: Game.cookiesPs,
            clickCps: Game.computedMouseCps || 0,
            prestige: Game.prestige,
            heavenlyChips: Game.heavenlyChips,
            heavenlyChipsSpent: Game.heavenlyChipsSpent,
            lumps: Game.lumps || 0,
            lumpT: Game.lumpT || 0,
            buildings: buildings,
            buffs: buffs,
            upgradesOwned: Game.upgradesOwned,
            upgradesAvailable: upgradesAvailable,
            phase: CookieCheater.getPhase(),
            stats: CookieCheater.stats,
            uptime: Math.floor((Date.now() - CookieCheater.stats.startTime) / 1000),
            season: Game.season || "",
            elderWrath: Game.elderWrath || 0,
            wrinklers: Game.wrinklers ? Game.wrinklers.filter(function(w) { return w.phase === 2; }).length : 0,
            dragonLevel: Game.dragonLevel || 0,
            market: CookieCheater._marketInfo || market,
            luckyBank: CookieCheater.getLuckyBank(),
            luckyBankPct: CookieCheater.getLuckyBank() > 0 ? Math.min(100, Math.round(Game.cookies / CookieCheater.getLuckyBank() * 100)) : 100,
            comboActive: CookieCheater._comboActive || false,
            comboScore: CookieCheater._comboScore || 1,
            purchaserPhase: CookieCheater.modules.purchaser ? CookieCheater.modules.purchaser.currentPhase : "unknown",
            postAscensionMode: CookieCheater.modules.purchaser ? CookieCheater.modules.purchaser._postAscensionMode : false,
            ascensionReady: (function() {
                var potential = Math.floor(Math.pow((Game.cookiesEarned || 0) / 1e12, 1/3));
                var current = Game.prestige || 0;
                if (current === 0) return potential >= 365;
                return potential >= current * 2;
            })(),
            strategy: CookieCheater.strategy || null,
            lumpProposal: CookieCheater._lumpProposal || null,
            grimoire: CookieCheater._grimoire || null,
            gardenPhase: CookieCheater.modules.garden ? CookieCheater.modules.garden._phase : null,
            gardenInfo: CookieCheater._gardenInfo || null,
            pantheonInfo: CookieCheater._pantheonInfo || null,
            grandmaInfo: CookieCheater._grandmaInfo || null,
        };
    },

    setConfig: function(cfg) {
        for (var k in cfg) {
            CookieCheater.config[k] = cfg[k];
        }
    },
};
