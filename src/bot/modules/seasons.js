// Season cycling for collecting all seasonal upgrades
// Cycles through: Christmas > Halloween > Easter > Valentine to unlock everything.
// Once all collected, stays on no season (or Christmas for reindeer).
//
// How seasonal drops work:
// - Christmas: buy Santa upgrades (appear in store), reindeer drop cookies
// - Halloween: wrinklers drop Halloween cookies when popped
// - Easter: golden cookies and wrinklers drop eggs
// - Valentine: heart biscuits appear in the store

CookieCheater.modules.seasons = {
    _seasonUpgrades: {
        christmas: "Christmas season",
        easter: "Easter season",
        halloween: "Halloween season",
        valentines: "Valentines season",
    },

    _seasonOrder: ["christmas", "halloween", "easter", "valentines"],
    _checkCache: {},       // Cache results to avoid scanning 700+ upgrades every tick
    _cacheExpiry: 60000,   // Refresh cache every 60s

    tick: function() {
        if (!CookieCheater.config.auto_season_cycle) return;
        if (!CookieCheater.throttle("seasons", 10000)) return;

        // Need Season switcher heavenly upgrade
        var switcher = Game.Upgrades["Season switcher"];
        if (!switcher || !switcher.bought) return;

        var incomplete = this._findIncompleteSeason();
        if (!incomplete) return;

        if (Game.season === incomplete) return;

        // Switch season
        var switchUpgrade = Game.Upgrades[this._seasonUpgrades[incomplete]];
        if (switchUpgrade && !switchUpgrade.bought && switchUpgrade.canBuy()) {
            switchUpgrade.buy();
            CookieCheater.log("seasons", "switch", "Switched to " + incomplete);
        }
    },

    _findIncompleteSeason: function() {
        for (var i = 0; i < this._seasonOrder.length; i++) {
            var season = this._seasonOrder[i];
            if (!this._isComplete(season)) return season;
        }
        return null;
    },

    _isComplete: function(season) {
        // Check cache first
        var cached = this._checkCache[season];
        if (cached && Date.now() - cached.time < this._cacheExpiry) {
            return cached.complete;
        }

        var complete = this._checkSeasonComplete(season);
        this._checkCache[season] = { complete: complete, time: Date.now() };
        return complete;
    },

    _checkSeasonComplete: function(season) {
        // Use achievement checks as primary method (most reliable)
        switch (season) {
            case "christmas":
                // "Let it snow" = got all Christmas cookies; also check Santa upgrades
                if (Game.Has("Let it snow")) return true;
                // Fallback: count Christmas cookies in store
                var santaLevel = Game.santaLevel || 0;
                return santaLevel >= 14; // Max Santa level
            case "halloween":
                if (Game.Has("Spooky cookies")) return true;
                return this._countPool("halloween") >= 7;
            case "easter":
                if (Game.Has("Egged on")) return true;
                return this._countPool("easter") >= 20;
            case "valentines":
                if (Game.Has("Lovely cookies")) return true;
                return this._countPool("valentines") >= 6;
        }
        return false;
    },

    _countPool: function(pool) {
        var bought = 0;
        for (var i = 0; i < Game.UpgradesById.length; i++) {
            var u = Game.UpgradesById[i];
            if (u.pool === pool && u.bought) bought++;
        }
        return bought;
    }
};
