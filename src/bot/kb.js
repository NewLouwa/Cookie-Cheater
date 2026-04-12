// ============================================================================
// CookieCheater Knowledge Base (kb.js)
// ============================================================================
// All game mechanics, upgrade categories, and decision rules.
// The purchaser reads this to make informed buy/skip/wait decisions.
//
// Sources: cookieclicker.wiki.gg, game source code analysis
// ============================================================================

CookieCheater.KB = {

    // ========================================================================
    // UPGRADE CATEGORIES
    // ========================================================================
    // Each category has:
    //   detect(u)    - returns true if upgrade belongs to this category
    //   value(u,cps) - returns estimated CPS delta from buying this upgrade
    //   priority     - base priority multiplier (higher = buy sooner)
    //   notes        - human-readable explanation
    // ========================================================================

    categories: {

        // ---- TIERED BUILDING UPGRADES ----
        // "Cursors/Grandmas/Farms/etc are twice as efficient"
        // Unlocked at building counts: 1, 5, 25, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600
        // Each doubles that building's CPS output
        tiered: {
            detect: function(u) {
                return (u.buildingTie1 || u.buildingTie) &&
                       u.desc && u.desc.indexOf("twice") !== -1;
            },
            value: function(u, cps) {
                var building = u.buildingTie1 || u.buildingTie;
                return building ? building.storedTotalCps : 0;
            },
            priority: 1.5, // High priority - direct CPS doubling
            notes: "Doubles one building type's output. Always good ROI."
        },

        // ---- GRANDMA TYPE UPGRADES ----
        // "Grandmas are twice as efficient. [Building] gain +1% CpS per N grandmas"
        // Dual effect: doubles grandma CPS + adds scaling bonus to a building
        grandmaType: {
            detect: function(u) {
                return u.buildingTie1 && u.desc &&
                       u.desc.indexOf("Grandma") !== -1 &&
                       u.desc.indexOf("+1%") !== -1;
            },
            value: function(u, cps) {
                // Doubles grandma CPS + adds grandma-scaling to another building
                var grandmaCps = Game.ObjectsById[1].storedTotalCps;
                var tiedBuilding = u.buildingTie1 || u.buildingTie;
                var tiedCps = tiedBuilding ? tiedBuilding.storedTotalCps : 0;
                // The +1% per N grandmas bonus on the tied building
                var grandmaCount = Game.ObjectsById[1].amount;
                // Extract the divisor from desc ("+1% CpS per N grandmas")
                var match = u.desc.match(/per (\d+) grandma/);
                var divisor = match ? parseInt(match[1]) : 1;
                var bonus = tiedCps * (grandmaCount / divisor) * 0.01;
                return grandmaCps + bonus;
            },
            priority: 1.4,
            notes: "Doubles grandma output + scales building with grandma count."
        },

        // ---- SYNERGY UPGRADES ----
        // Two per building (except Cursor/Grandma). Pairs two buildings.
        // Boosted building gains +5% CpS per base building owned
        // Base building gains +0.1% CpS per boosted building owned
        synergy: {
            detect: function(u) {
                return u.desc && (u.desc.indexOf("+5%") !== -1 || u.desc.indexOf("+0.1%") !== -1) &&
                       u.desc.indexOf("synergy") !== -1;
            },
            value: function(u, cps) {
                // Rough: ~5-10% CPS boost depending on building counts
                return cps * 0.07;
            },
            priority: 1.3,
            notes: "+5% CpS per base building to boosted, +0.1% reverse. Strong in late game."
        },

        // ---- KITTEN UPGRADES ----
        // Multiply ALL CPS by (1 + milk * factor) where milk = achievements * 0.04
        // These are MULTIPLICATIVE with each other = strongest upgrade category
        //
        // Exact milk factors:
        //   Kitten helpers:      0.10    Kitten assistants...: 0.175
        //   Kitten workers:      0.125   Kitten marketeers:   0.15
        //   Kitten engineers:    0.15    Kitten analysts:     0.125
        //   Kitten overseers:    0.175   Kitten executives:   0.115
        //   Kitten managers:     0.20    Kitten admins:       0.11
        //   Kitten accountants:  0.20    Kitten strategists:  0.105
        //   Kitten specialists:  0.20    Fortune #103:        0.05
        //   Kitten experts:      0.20    Kitten angels:       0.10
        //   Kitten consultants:  0.20
        //
        // With 200% milk and factor 0.2: multiplier = 1 + 2.0 * 0.2 = 1.4x
        // All kittens stack multiplicatively: 1.2 * 1.25 * 1.3 * ... = HUGE
        kitten: {
            detect: function(u) {
                var name = u.name || "";
                return name.indexOf("Kitten") !== -1 || name === "Fortune #103";
            },
            value: function(u, cps) {
                // Estimate: kitten upgrades multiply ALL CPS by (1 + milk * factor)
                // milk = achievements * 0.04
                var milk = Game.milkProgress || (Game.AchievementsOwned * 0.04);
                var factor = CookieCheater.KB._kittenFactor(u.name);
                // The CPS gain is: currentCPS * (1 + milk * factor) - currentCPS
                //                = currentCPS * milk * factor
                return cps * milk * factor;
            },
            priority: 2.0, // HIGHEST priority - multiplicative stacking
            notes: "Multiplicative CPS multiplier based on milk. Best upgrades in the game."
        },

        // ---- FLAVORED COOKIES ----
        // Flat "+X% CPS" multiplier. Stacks multiplicatively with other multipliers.
        // ~245 total. Most give +1% to +5%.
        // Includes seasonal cookies (Christmas, Halloween, Easter, Valentine)
        flavored: {
            detect: function(u) {
                return u.desc && u.desc.indexOf("Cookie production multiplier") !== -1;
            },
            value: function(u, cps) {
                var match = u.desc.match(/\+(\d+)%/);
                var pct = match ? parseInt(match[1]) : 1;
                return cps * pct / 100;
            },
            priority: 1.0,
            notes: "Flat CPS percentage boost. Always buy when affordable."
        },

        // ---- GOLDEN COOKIE UPGRADES ----
        // CRITICAL for progression. These massively increase income via golden cookies.
        //
        // Lucky day:     GC appear 2x often, last 2x longer. Cost: 777.778M. Unlock: 7 GC clicked.
        // Serendipity:   GC appear 2x often, last 2x longer (stacks). Cost: 77.778B. Unlock: 27 GC.
        // Get lucky:     GC effects last 2x longer. Cost: 77.778T. Unlock: 77 GC clicked.
        //
        // These three together = GC 4x more frequent, last 4x longer, effects 2x duration
        // Combined they multiply golden cookie income by roughly 16x
        goldenCookie: {
            detect: function(u) {
                var name = u.name || "";
                return name === "Lucky day" || name === "Serendipity" || name === "Get lucky" ||
                       name === "Green yeast digestives" || name === "Dragon fang" ||
                       (u.desc && u.desc.indexOf("golden cookie") !== -1 && u.desc.indexOf("twice") !== -1);
            },
            value: function(u, cps) {
                // These are so impactful they should be bought ASAP
                // Estimate: each one roughly doubles golden cookie income
                // Golden cookies are ~30-50% of total income in mid-game
                return cps * 0.5;
            },
            priority: 2.5, // MAXIMUM priority - game-changing
            notes: "Golden cookie frequency/duration. Buy IMMEDIATELY when available."
        },

        // ---- CLICKING UPGRADES ----
        // Mouse upgrades: each gives "+1% of CPS" per click
        // Plastic/Iron/Titanium/Adamantium/Unobtainium/Eludium/Wishalloy/Fantasteel/
        //   Nevercrack/Armythril/Technobsidian/Plasmarble/Miraculite mouse
        // Cursor upgrades: "+0.1 cookies per non-cursor" with multipliers (1x,5x,10x,20x,etc)
        clicking: {
            detect: function(u) {
                var name = u.name || "";
                var desc = u.desc || "";
                return name.indexOf("mouse") !== -1 ||
                       desc.indexOf("Clicking gains") !== -1 ||
                       desc.indexOf("cookies for each non-cursor") !== -1;
            },
            value: function(u, cps) {
                // Mouse: +1% CPS per click. Value depends on clicking frequency
                // With auto-clicker doing ~30 clicks/s during buffs: decent
                // Cursor "+X per non-cursor": scales with total building count
                if (u.desc && u.desc.indexOf("non-cursor") !== -1) {
                    var totalBuildings = 0;
                    for (var i = 1; i < Game.ObjectsById.length; i++) {
                        totalBuildings += Game.ObjectsById[i].amount;
                    }
                    // Parse multiplier from desc
                    var match = u.desc.match(/(\d+) cookies/);
                    var base = match ? parseInt(match[1]) : 1;
                    return base * totalBuildings * Game.ObjectsById[0].amount;
                }
                // Mouse upgrade: +1% CPS per click, ~30 clicks/s = 30% CPS
                return cps * 0.01;
            },
            priority: 0.8,
            notes: "Clicking power. Good during combos, mediocre passively."
        },

        // ---- RESEARCH UPGRADES (Bingo Center) ----
        // Sequential chain, auto-unlocks. Includes Grandmapocalypse triggers.
        // 1. Specialized chocolate chips (+1% CPS)
        // 2. Designer cocoa beans (+2% CPS)
        // 3. Ritual rolling pins (Grandma 2x)
        // 4. Underworld ovens (+3% CPS)
        // 5. One Mind (Grandma 2x + starts Grandmapocalypse stage 1)
        // 6. Exotic nuts (+4% CPS)
        // 7. Communal brainsweep (Grandma 2x + Grandmapocalypse stage 2)
        // 8. Arcane sugar (+5% CPS)
        // 9. Elder Pact (Grandma 2x + Grandmapocalypse stage 3)
        research: {
            detect: function(u) {
                var names = [
                    "Specialized chocolate chips", "Designer cocoa beans",
                    "Ritual rolling pins", "Underworld ovens", "One mind",
                    "Exotic nuts", "Communal brainsweep", "Arcane sugar", "Elder Pact"
                ];
                return names.indexOf(u.name) !== -1;
            },
            value: function(u, cps) {
                // CPS multiplier research = straightforward
                var match = u.desc && u.desc.match(/\+(\d+)%/);
                if (match) return cps * parseInt(match[1]) / 100;
                // Grandma doubling
                if (u.desc && u.desc.indexOf("twice") !== -1) {
                    return Game.ObjectsById[1].storedTotalCps;
                }
                return cps * 0.02;
            },
            priority: 1.2,
            notes: "Research chain. Always buy (Grandmapocalypse managed by its own module)."
        },

        // ---- SEASONAL UPGRADES ----
        // Automatically handled by seasons.js module.
        // Christmas: 7 Santa upgrades (each +X% CPS + special effects)
        // Easter: 20 eggs (each +1% CPS or special like "egg" = +9% CPS)
        // Halloween: 7 cookies (each +2% CPS)
        // Valentine: 6 heart cookies (each give various bonuses)
        seasonal: {
            detect: function(u) {
                return u.pool === "easter" || u.pool === "halloween" || u.pool === "valentines" ||
                       (u.name && u.name.indexOf("Santa") !== -1);
            },
            value: function(u, cps) {
                // Seasonal drops: usually small CPS boosts
                // Easter eggs average ~1% each, Halloween ~2%, Valentine varies
                return cps * 0.02;
            },
            priority: 1.1,
            notes: "Seasonal drops. Buy whenever they appear (seasons module handles cycling)."
        },

        // ---- FORTUNE UPGRADES ----
        // Appear from the news ticker. "+X% CPS for each [building]"
        // Very strong because they scale with building count
        fortune: {
            detect: function(u) {
                var name = u.name || "";
                return name.indexOf("Fortune #") !== -1 ||
                       name.indexOf("fortune") !== -1;
            },
            value: function(u, cps) {
                // Fortune upgrades are typically very valuable
                return cps * 0.05;
            },
            priority: 1.5,
            notes: "News ticker fortunes. Strong scaling, always buy."
        },

        // ---- ELDER PLEDGE / COVENANT ----
        // Special: managed by grandmapocalypse.js module
        elderControl: {
            detect: function(u) {
                var name = u.name || "";
                return name === "Elder Pledge" || name === "Elder Covenant" ||
                       name === "Revoke Elder Covenant";
            },
            value: function(u, cps) {
                return 0; // Handled by grandmapocalypse module, not purchaser
            },
            priority: 0, // Don't auto-buy, let the grandmapocalypse module decide
            notes: "Managed by grandmapocalypse module. Purchaser should SKIP these."
        },

        // ---- SEASON SWITCHERS ----
        // Managed by seasons.js module
        seasonSwitcher: {
            detect: function(u) {
                var name = u.name || "";
                return name.indexOf("season") !== -1 && (
                    name === "Christmas season" || name === "Easter season" ||
                    name === "Halloween season" || name === "Valentines season" ||
                    name === "Business season"
                );
            },
            value: function(u, cps) {
                return 0; // Handled by seasons module
            },
            priority: 0,
            notes: "Season switching. Managed by seasons module, purchaser should SKIP."
        },
    },

    // ========================================================================
    // HELPER: Kitten milk factor lookup
    // ========================================================================
    _kittenFactors: {
        "Kitten helpers": 0.10,
        "Kitten workers": 0.125,
        "Kitten engineers": 0.15,
        "Kitten overseers": 0.175,
        "Kitten managers": 0.20,
        "Kitten accountants": 0.20,
        "Kitten specialists": 0.20,
        "Kitten experts": 0.20,
        "Kitten consultants": 0.20,
        "Kitten assistants to the regional manager": 0.175,
        "Kitten marketeers": 0.15,
        "Kitten analysts": 0.125,
        "Kitten executives": 0.115,
        "Kitten admins": 0.11,
        "Kitten strategists": 0.105,
        "Fortune #103": 0.05,
        "Kitten angels": 0.10,
    },

    _kittenFactor: function(name) {
        return CookieCheater.KB._kittenFactors[name] || 0.10; // Default to 0.10
    },

    // ========================================================================
    // MAIN ANALYSIS: Classify and evaluate any upgrade
    // ========================================================================
    analyzeUpgrade: function(upgrade, cps) {
        for (var catName in CookieCheater.KB.categories) {
            var cat = CookieCheater.KB.categories[catName];
            if (cat.detect(upgrade)) {
                var value = cat.value(upgrade, cps);
                return {
                    category: catName,
                    value: value,
                    priority: cat.priority,
                    payback: value > 0 ? (upgrade.basePrice / value) / cat.priority : Infinity,
                    skip: cat.priority === 0, // Managed by another module
                    notes: cat.notes
                };
            }
        }

        // Unknown upgrade - fallback: buy if cheap
        return {
            category: "unknown",
            value: cps * 0.01,
            priority: 0.5,
            payback: upgrade.basePrice / Math.max(cps * 0.01, 0.001),
            skip: false,
            notes: "Unknown upgrade type. Buy if cheap."
        };
    },

    // ========================================================================
    // COMBO STRATEGIES (from wiki General Combo Guide)
    // ========================================================================
    // Combos are the PRIMARY way to progress mid-to-late game.
    // A combo requires at least one CPS multiplier + one Click multiplier.
    //
    // Tier 1 (Basic):
    //   Frenzy(x7) + Click Frenzy(x777) = x5,439 per click
    //   Frenzy(x7) + Dragonflight(x1111) = x7,777 per click
    //
    // Tier 2 (Advanced):
    //   Frenzy(x7) + Building Special(variable) + Click Frenzy(x777)
    //   = massive burst, scales with building count
    //
    // Tier 3 (Endgame):
    //   Elder Frenzy(x666) + Click Frenzy(x777) = x517,482 per click
    //   (requires Grandmapocalypse stage 3 for wrath cookies)
    //
    // COMBO SETUP:
    // 1. Wait for natural Frenzy (golden cookie, most common buff)
    // 2. While Frenzy active, cast Force the Hand of Fate (Grimoire)
    //    - FtHoF during Frenzy has high chance of Click Frenzy or Building Special
    // 3. Immediately: swap Godzamok into Diamond, sell 200+ cheap buildings
    // 4. Burst-click for 10-13 seconds
    // 5. Rebuy sold buildings after combo expires
    //
    // GODZAMOK STRATEGY:
    // - Diamond slot: +1% click power per building sold for 10 seconds
    // - Sell buildings that contribute <2% total CPS (Cursors, Farms, Mines)
    // - Never sell Wizard Towers (need magic for spells)
    // - Selling 200 buildings = +200% click power on top of combo
    //
    // GARDEN BOOST:
    // - Whiskerblooms: nearly always better than Thumbcorn
    // - Plant full garden of Whiskerblooms before combo attempts
    // - They provide ~5-15% CPS boost that multiplies with combo
    //
    // AURA SWAP:
    // - During combo: Dragonflight or Dragon Cursor aura
    // - Passive: Radiant Appetite (x2 CPS) + Breath of Milk
    combos: {
        tier1: { name: "Frenzy + Click Frenzy", multiplier: 5439 },
        tier2: { name: "Frenzy + Building Special + CF", multiplier: "variable (100K+)" },
        tier3: { name: "Elder Frenzy + Click Frenzy", multiplier: 517482 },
        godzamokTargets: [0, 2, 3, 4], // Cursor, Farm, Mine, Factory (cheap to rebuy)
        godzamokSafe: [7], // Never sell Wizard Towers
        minSellCount: 100, // Minimum buildings to sell for meaningful boost
    },

    // ========================================================================
    // PRESTIGE MECHANICS (from wiki)
    // ========================================================================
    // Formula: prestige = floor((cookiesBakedAllTime / 1e12) ^ (1/3))
    // NOTE: This is CUBE ROOT, not square root!
    // Each prestige level = +1% CPS (additive, requires Legacy upgrade)
    // Ascending resets: buildings, upgrades, bank, wrinklers
    // Keeps: heavenly upgrades, permanent upgrade slots, challenge status
    //
    // Optimal ascension timing:
    //   First: at 365 prestige (48.6 quintillion cookies baked)
    //   Subsequent: when new prestige >= current * 2 (doubling rule)
    //
    // Key heavenly upgrades that directly boost CPS:
    //   Heavenly Cookies: +10% production
    //   Wrinkly Cookies: +10% production
    //   Sugar Crystal Cookies: +5% plus per-building-level bonus
    //   Lucky Digit/Number/Payout: +1% prestige effect each
    prestige: {
        formula: function(cookiesBaked) {
            return Math.floor(Math.pow(cookiesBaked / 1e12, 1/3));
        },
        cookiesNeeded: function(targetPrestige) {
            return Math.pow(targetPrestige, 3) * 1e12;
        },
        firstTarget: 365,
        subsequentMultiplier: 2.0,
    },

    // ========================================================================
    // GOLDEN COOKIE MECHANICS
    // ========================================================================
    // Lucky payout = min(900 * CPS, 15% of bank + 13)
    // To max Lucky: bank >= 6000 * CPS
    // During Frenzy (x7): bank >= 42000 * CPS (because CPS is multiplied)
    //
    // Golden cookie effects:
    //   Frenzy:         x7 CPS for 77s (154s with Get lucky)
    //   Lucky:          min(900*CPS, 15% bank) cookies instantly
    //   Click Frenzy:   x777 click for 13s (26s with Get lucky)
    //   Building Spec:  +10% CPS per building count for 30s
    //   Cookie Storm:   1-7 minutes CPS via rapid clicks for 7s
    //   Dragonflight:   x1111 click (with Dragon Harvest aura)
    //   Elder Frenzy:   x666 CPS for 6s (12s with Get lucky)
    //   Clot:           x0.5 CPS for 66s (wrath cookie)
    //   Ruin:           lose min(900*CPS, 5% bank) (wrath cookie)
    goldenCookie: {
        luckyBank: function(cps) { return cps * 6000; },
        frenzyLuckyBank: function(cps) { return cps * 42000; },
        luckyPayout: function(cps, bank) {
            return Math.min(cps * 900, bank * 0.15 + 13);
        }
    },

    // ========================================================================
    // BUILDING MILESTONES (unlock tiered upgrades)
    // ========================================================================
    buildingMilestones: [1, 5, 25, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600],

    // ========================================================================
    // PRESTIGE / HEAVENLY UPGRADE PRIORITY
    // ========================================================================
    heavenlyPriority: [
        "Legacy",                          // Enables prestige CPS multiplier
        "Heavenly cookies",                // Prestige applies to CPS
        "How to bake your dragon",         // Unlocks Krumblor
        "Heavenly luck",                   // GC may give double
        "Lasting fortune",                 // GC effects last longer
        "Season switcher",                 // Can switch seasons
        "Starter kit",                     // Start with 10 cursors
        "Starter kitchen",                 // Start with 10 cursors
        "Permanent upgrade slot I",        // Keep 1 upgrade across ascensions
        "Permanent upgrade slot II",
        "Permanent upgrade slot III",
        "Permanent upgrade slot IV",
        "Permanent upgrade slot V",
        "Heavenly chip secret",
        "Heavenly cookie stand",
        "Heavenly bakery",
        "Heavenly confectionery",
        "Heavenly key",
        "Kitten angels",                   // Heavenly kitten upgrade
        "Sugar craving",                   // Sugar lump upgrades
        "Sugar aging process",
        "Sugar baking",                    // +1% CPS per unspent lump (max 100)
        "Golden switch",                   // Toggle: +50% CPS but no golden cookies
        "Shimmering veil",                 // +50% CPS but breaks on GC click
    ],
};
