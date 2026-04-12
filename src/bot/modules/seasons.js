// Season cycling for collecting all seasonal upgrades
// Cycles through: Christmas > Easter > Halloween > Valentine to unlock everything.
// Once all seasonal upgrades are collected, stays on no season or Christmas.

CookieCheater.modules.seasons = {
    // Season upgrade IDs (the "Season switcher" upgrades)
    _seasonUpgrades: {
        christmas: "Christmas season",
        easter: "Easter season",
        halloween: "Halloween season",
        valentines: "Valentines season",
        fools: "Business season",
    },

    // Track which seasons are fully collected
    _seasonOrder: ["christmas", "halloween", "easter", "valentines"],
    _currentTarget: 0,

    tick: function() {
        if (!CookieCheater.config.auto_season_cycle) return;
        if (!CookieCheater.throttle("seasons", 10000)) return;

        // Check if Season switcher is available (heavenly upgrade)
        var switcher = Game.Upgrades["Season switcher"];
        if (!switcher || !switcher.bought) return;

        // Check which seasons still have uncollected upgrades
        var incomplete = this._findIncompleteSeason();
        if (!incomplete) {
            // All collected! Stay on no season for efficiency
            return;
        }

        // If we're already in the right season, nothing to do
        if (Game.season === incomplete) return;

        // Switch to the incomplete season
        var switchUpgrade = Game.Upgrades[this._seasonUpgrades[incomplete]];
        if (switchUpgrade && switchUpgrade.canBuy()) {
            switchUpgrade.buy();
            CookieCheater.log("seasons", "switch", "Switched to " + incomplete);
        }
    },

    _findIncompleteSeason: function() {
        // Check each season for uncollected upgrades
        for (var i = 0; i < this._seasonOrder.length; i++) {
            var season = this._seasonOrder[i];
            if (this._hasUnlockedAll(season)) continue;
            return season;
        }
        return null;
    },

    _hasUnlockedAll: function(season) {
        // Check if all upgrades for a season are bought
        // The game tracks these via upgrade pools
        var count = 0;
        var total = 0;

        for (var i = 0; i < Game.UpgradesById.length; i++) {
            var u = Game.UpgradesById[i];
            if (!u.pool) continue;

            var isMatch = false;
            if (season === "christmas" && (u.pool === "cookie" && u.name.indexOf("Christmas") !== -1)) isMatch = true;
            if (season === "easter" && u.pool === "easter") isMatch = true;
            if (season === "halloween" && u.pool === "halloween") isMatch = true;
            if (season === "valentines" && u.pool === "valentines") isMatch = true;

            if (isMatch) {
                total++;
                if (u.bought) count++;
            }
        }

        // If we found seasonal upgrades and all are bought
        if (total > 0 && count >= total) return true;

        // Fallback: check Game.season achievements/counters
        // Christmas: 7 reindeer cookies + 7 Santa upgrades
        // Easter: 20 eggs
        // Halloween: 7 halloween cookies
        // Valentine: 6 heart cookies
        if (season === "christmas") return Game.Has("Season's greetings") ? true : false;
        if (season === "easter") return Game.Has("Egged on") ? true : false;
        if (season === "halloween") return Game.Has("Spooky cookies") ? true : false;
        if (season === "valentines") return Game.Has("Lovely cookies") ? true : false;

        return false;
    }
};
