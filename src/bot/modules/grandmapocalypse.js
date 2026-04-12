// ============================================================================
// GRANDMAPOCALYPSE MANAGEMENT
// ============================================================================
// The research chain (Bingo Center) triggers the Grandmapocalypse:
//   One Mind → elderWrath=1 (Awoken): some golden cookies become wrath
//   Communal Brainsweep → elderWrath=2 (Displeased): more wrath cookies
//   Elder Pact → elderWrath=3 (Angered): ALL golden → wrath, wrinklers spawn
//
// Strategies:
//   "pledge": Buy Elder Pledge whenever elderWrath > 0 (30min peace)
//             Cost starts at 666K, x8 each purchase (caps at ~4.4T)
//             Best for: active play with golden cookie combos
//
//   "covenant": Buy Elder Covenant (permanent peace, -5% CPS)
//               Cost: 66.6T. Can be revoked for 6.66B.
//               Best for: set-and-forget
//
//   "full": Let Grandmapocalypse run. Wrinklers spawn (1.1x return each).
//           Wrath cookies appear (Elder Frenzy x666 CPS for 6s = huge).
//           Best for: late game with wrinkler management active
//
// This module also watches the research chain and warns about
// Grandmapocalypse triggers BEFORE they happen.

CookieCheater.modules.grandmapocalypse = {
    _lastPledgeTime: 0,

    tick: function() {
        if (!CookieCheater.throttle("grandma", 3000)) return;

        var strategy = CookieCheater.config.grandmapocalypse_strategy;
        var wrath = Game.elderWrath || 0;

        // Expose state for dashboard
        this._exposeState(wrath, strategy);

        if (strategy === "pledge") {
            this._handlePledge(wrath);
        } else if (strategy === "covenant") {
            this._handleCovenant(wrath);
        }
        // "full" mode: do nothing, let it run

        // Warn about upcoming research that triggers Grandmapocalypse
        this._warnResearch();
    },

    _handlePledge: function(wrath) {
        if (wrath === 0) return; // Peace — nothing to do

        var pledge = Game.Upgrades["Elder Pledge"];
        if (!pledge) return;

        // Elder Pledge appears in store when Grandmapocalypse is active
        if (!pledge.bought && pledge.unlocked && pledge.canBuy()) {
            pledge.buy();
            this._lastPledgeTime = Date.now();
            CookieCheater.justify("grandmapocalypse", "PLEDGE",
                "Bought Elder Pledge (30min peace) — elderWrath was " + wrath +
                " (cost: $" + CookieCheater.modules.purchaser._fmt(pledge.basePrice) + ")");
        } else if (!pledge.canBuy() && pledge.unlocked) {
            CookieCheater.justify("grandmapocalypse", "PLEDGE_WAIT",
                "Need Elder Pledge but can't afford $" + CookieCheater.modules.purchaser._fmt(pledge.basePrice) +
                " — elderWrath=" + wrath + ", wrath cookies active!");
        }
    },

    _handleCovenant: function(wrath) {
        // Try Elder Covenant first (permanent)
        var covenant = Game.Upgrades["Elder Covenant"];
        if (covenant && !covenant.bought && covenant.unlocked && covenant.canBuy()) {
            covenant.buy();
            CookieCheater.justify("grandmapocalypse", "COVENANT",
                "Bought Elder Covenant (permanent peace, -5% CPS)");
            return;
        }

        // Fall back to pledge while saving for covenant
        if (wrath > 0) {
            this._handlePledge(wrath);
        }
    },

    _warnResearch: function() {
        if (!CookieCheater.throttle("grandma_warn", 30000)) return; // Check every 30s

        // Warn if One Mind is about to be bought (triggers Stage 1)
        var oneMind = Game.Upgrades["One mind"];
        if (oneMind && oneMind.unlocked && !oneMind.bought) {
            CookieCheater.justify("grandmapocalypse", "WARNING",
                "One Mind is available! Buying it starts the Grandmapocalypse " +
                "(golden cookies → wrath cookies). Strategy: " + CookieCheater.config.grandmapocalypse_strategy);
        }
    },

    _exposeState: function(wrath, strategy) {
        var wrathNames = ["None", "Awoken", "Displeased", "Angered"];
        var pledgeUp = Game.Upgrades["Elder Pledge"];
        var covenantUp = Game.Upgrades["Elder Covenant"];

        CookieCheater._grandmaInfo = {
            elderWrath: wrath,
            wrathName: wrathNames[wrath] || "Unknown",
            strategy: strategy,
            pledgeAvailable: pledgeUp ? (pledgeUp.unlocked && !pledgeUp.bought) : false,
            pledgeCost: pledgeUp ? pledgeUp.basePrice : 0,
            pledgeCanBuy: pledgeUp ? pledgeUp.canBuy() : false,
            covenantAvailable: covenantUp ? (covenantUp.unlocked && !covenantUp.bought) : false,
            covenantCost: covenantUp ? covenantUp.basePrice : 0,
            // Research progress
            oneMind: Game.Upgrades["One mind"] ? Game.Upgrades["One mind"].bought : false,
            communal: Game.Upgrades["Communal brainsweep"] ? Game.Upgrades["Communal brainsweep"].bought : false,
            elderPact: Game.Upgrades["Elder Pact"] ? Game.Upgrades["Elder Pact"].bought : false,
        };
    },
};
