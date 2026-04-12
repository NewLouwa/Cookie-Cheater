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
                if (!building) return 0;
                var directCps = building.storedTotalCps;
                // Floor: doubling ANY building is worth at least 1% of total CPS
                // because the game recalculates synergies, grandma bonuses, etc.
                // storedTotalCps only shows direct output, not indirect multiplier effects
                var floorVal = cps * 0.03;
                return Math.max(directCps, floorVal);
            },
            priority: 1.5,
            notes: "Doubles one building type's output. Always good ROI."
        },

        // ---- GRANDMA TYPE UPGRADES ----
        // "Grandmas are twice as efficient. [Building] gain +1% CpS per N grandmas"
        // Dual effect: doubles grandma CPS + adds scaling bonus to a building
        grandmaType: {
            detect: function(u) {
                return u.desc &&
                       u.desc.indexOf("Grandma") !== -1 &&
                       u.desc.indexOf("+1%") !== -1 &&
                       u.desc.indexOf("grandma") !== -1;
            },
            value: function(u, cps) {
                // Doubles grandma CPS + adds grandma-scaling to another building
                var grandmaCps = Game.ObjectsById[1].storedTotalCps;
                var tiedBuilding = u.buildingTie1 || u.buildingTie;
                var tiedCps = tiedBuilding ? tiedBuilding.storedTotalCps : 0;
                var grandmaCount = Game.ObjectsById[1].amount;
                var match = u.desc.match(/per (\d+) grandma/);
                var divisor = match ? parseInt(match[1]) : 1;
                var bonus = tiedCps * (grandmaCount / divisor) * 0.01;
                // Floor: at least 1% of CPS (indirect effects from grandma synergies)
                return Math.max(grandmaCps + bonus, cps * 0.01);
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
            priority: 1.3, // Permanent multiplicative boost — more valuable than buildings
            notes: "Permanent CPS percentage boost. Stacks multiplicatively. Always buy."
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
        // SAFE: Specialized chocolate chips, Designer cocoa beans, Ritual rolling pins,
        //       Underworld ovens, Exotic nuts, Arcane sugar
        // DANGEROUS (triggers Grandmapocalypse stages):
        //   One Mind → Stage 1: some golden → wrath cookies
        //   Communal Brainsweep → Stage 2: more wrath cookies
        //   Elder Pact → Stage 3: ALL golden → wrath, wrinklers spawn
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
                // SKIP Grandmapocalypse triggers unless strategy is "full"
                var dangerousNames = ["One mind", "Communal brainsweep", "Elder Pact"];
                if (dangerousNames.indexOf(u.name) !== -1) {
                    var strategy = CookieCheater.config.grandmapocalypse_strategy;
                    if (strategy !== "full") {
                        return 0; // Don't buy — would start wrath cookies
                    }
                }
                // CPS multiplier research
                var match = u.desc && u.desc.match(/\+(\d+)%/);
                if (match) return cps * parseInt(match[1]) / 100;
                // Grandma doubling
                if (u.desc && u.desc.indexOf("twice") !== -1) {
                    return Math.max(Game.ObjectsById[1].storedTotalCps, cps * 0.03);
                }
                return cps * 0.02;
            },
            priority: 1.2,
            notes: "Research chain. Safe upgrades always bought. Grandmapocalypse triggers skipped unless strategy='full'."
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

        // ---- SPECIAL / UNIQUE UPGRADES ----
        // One-off upgrades that don't fit other categories but are very valuable
        special: {
            detect: function(u) {
                var specials = [
                    "Bingo center/Research facility",  // 4x grandma + unlocks research chain
                    "Specialized chocolate chips", "Designer cocoa beans",
                    "Ritual rolling pins", "Underworld ovens", "Exotic nuts", "Arcane sugar",
                    "A festive hat", "Reindeer baking grounds",        // Santa/Christmas
                    "Ho ho ho-flavored frosting", "Season savings",
                    "Toy workshop", "Naughty list", "Santa's helpers",
                    "Santa's legacy", "Santa's bottomless bag",
                    "Santa's milk and cookies", "Santa's dominion",
                    "How to bake your dragon",                         // Dragon
                    "A crumbly egg",
                    "Golden goose egg", "Faberge egg",                 // Easter special
                    "Omelette", "Chocolate egg", "Century egg",
                    "Cookie egg",
                ];
                return specials.indexOf(u.name) !== -1;
            },
            value: function(u, cps) {
                // These are game-changing upgrades. Estimate high value.
                var name = u.name;
                if (name === "Bingo center/Research facility") return cps * 0.5; // 4x grandma + research chain
                if (name === "How to bake your dragon") return cps * 0.3;
                if (name === "Chocolate egg") return cps * 0.05; // 5% of bank on buy
                // Santa upgrades: each gives ~1-3% CPS boost
                if (name.indexOf("Santa") !== -1) return cps * 0.02;
                // Research chain upgrades
                if (name === "Exotic nuts") return cps * 0.04;
                if (name === "Arcane sugar") return cps * 0.05;
                // Default special: treat as 2% CPS
                return cps * 0.02;
            },
            priority: 1.8,
            notes: "Unique game-changing upgrade. Buy when affordable."
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

        // Unknown upgrade - try harder to estimate value
        var unknownValue = cps * 0.01;
        var unknownPriority = 0.5;
        var desc = upgrade.desc || "";

        // Check for multiplier patterns we might have missed
        if (desc.indexOf("times as efficient") !== -1 || desc.indexOf("twice") !== -1) {
            // Some kind of building multiplier we didn't catch
            var tie = upgrade.buildingTie1 || upgrade.buildingTie;
            if (tie) {
                unknownValue = Math.max(tie.storedTotalCps, cps * 0.01);
                unknownPriority = 1.2;
            }
        }
        if (desc.indexOf("Cookie production multiplier") !== -1) {
            var pctM = desc.match(/\+(\d+)%/);
            unknownValue = cps * (pctM ? parseInt(pctM[1]) / 100 : 0.02);
            unknownPriority = 1.0;
        }
        if (desc.indexOf("golden cookie") !== -1 || desc.indexOf("Golden cookie") !== -1) {
            unknownValue = cps * 0.1;
            unknownPriority = 1.5;
        }

        return {
            category: "unknown",
            value: unknownValue,
            priority: unknownPriority,
            payback: upgrade.basePrice / Math.max(unknownValue, 0.001),
            skip: false,
            notes: "Unrecognized upgrade. Estimated from description."
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
        // Full names of all golden cookie / wrath cookie buffs
        buffNames: {
            "Frenzy":           "x7 CPS for 77s (154s with Get Lucky). Most common golden cookie buff.",
            "Lucky":            "Instant cookies = min(900*CPS, 15% of bank + 13). Bank 6000*CPS to maximize.",
            "Click Frenzy":     "x777 clicking power for 13s (26s with Get Lucky). THE combo buff.",
            "Building Special": "+10% CPS per building count for 30s. Scales hard with many buildings.",
            "Cookie Storm":     "Rapid cookie rain: 1-7 min CPS via clicking for 7s.",
            "Dragonflight":     "x1111 clicking power. Requires Dragonflight aura.",
            "Dragon Harvest":   "x15 clicking power. Requires Dragon Harvest aura.",
            "Elder Frenzy":     "x666 CPS for 6s (12s with Get Lucky). Wrath cookie only.",
            "Clot":             "x0.5 CPS for 66s. Bad wrath cookie outcome.",
            "Cursed Finger":    "CPS=0, but each click gives 10s of CPS. Good with fast clicking.",
            "Sugar Frenzy":     "x3 CPS for 1h. Costs 1 sugar lump.",
        },

        // Named combo tiers with full buff names
        tier1: {
            name: "Frenzy + Click Frenzy",
            fullName: "Golden Cookie 'Frenzy' (x7 CPS) + Force the Hand of Fate 'Click Frenzy' (x777 click)",
            multiplier: 5439,
            setup: "Wait for natural Frenzy, then cast FtHoF for Click Frenzy. Burst-click for 13-26s."
        },
        tier1b: {
            name: "Frenzy + Dragonflight",
            fullName: "Golden Cookie 'Frenzy' (x7 CPS) + Dragonflight aura 'Dragonflight' (x1111 click)",
            multiplier: 7777,
            setup: "Requires Dragonflight dragon aura. Wait for Frenzy, then natural GC gives Dragonflight."
        },
        tier2: {
            name: "Frenzy + Building Special + Click Frenzy",
            fullName: "Golden Cookie 'Frenzy' (x7) + 'Building Special' (+10%/building) + FtHoF 'Click Frenzy' (x777)",
            multiplier: "variable (100K+, scales with building count)",
            setup: "Requires 2 golden cookies + FtHoF. Extremely rare naturally, use spell planning."
        },
        tier3: {
            name: "Elder Frenzy + Click Frenzy",
            fullName: "Wrath Cookie 'Elder Frenzy' (x666 CPS) + Force the Hand of Fate 'Click Frenzy' (x777 click)",
            multiplier: 517482,
            setup: "Requires Grandmapocalypse stage 3. Wrath cookie gives Elder Frenzy, then FtHoF."
        },

        // Godzamok details
        godzamok: {
            fullName: "Pantheon Spirit 'Godzamok, Spirit of Ruin' in Diamond slot",
            effect: "+1% clicking power per building sold for 10 seconds",
            targets: [0, 2, 3, 4], // Cursor, Farm, Mine, Factory (cheap to rebuy)
            safe: [7], // Never sell Wizard Towers (need magic)
            minSellCount: 100,
            note: "Sell 200 buildings = +200% click power on TOP of combo multiplier"
        },

        godzamokTargets: [0, 2, 3, 4],
        godzamokSafe: [7],
        minSellCount: 100,
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
    // ========================================================================
    // GARDEN KNOWLEDGE
    // ========================================================================
    garden: {
        // Soils: id, name, farms needed, tick speed (minutes), weed mult, efficiency mult, special
        soils: {
            dirt:       { id: 0, tickMin: 5,  weedMult: 1,   effMult: 1,    mutMult: 1, note: "Default" },
            fertilizer: { id: 1, tickMin: 3,  weedMult: 1.2, effMult: 0.75, mutMult: 1, note: "Faster growth, less efficient", farmsNeeded: 50 },
            clay:       { id: 2, tickMin: 15, weedMult: 1,   effMult: 1.25, mutMult: 1, note: "Slow growth, more efficient", farmsNeeded: 100 },
            pebbles:    { id: 3, tickMin: 5,  weedMult: 0.1, effMult: 0.25, mutMult: 1, note: "35% auto-harvest on expire", farmsNeeded: 200 },
            woodChips:  { id: 4, tickMin: 5,  weedMult: 0.1, effMult: 0.25, mutMult: 3, note: "3x mutation rate!", farmsNeeded: 300 },
        },

        // Farm level -> grid size [cols, rows]
        plotSizes: {
            1: [2,2], 2: [3,2], 3: [3,3], 4: [4,3], 5: [4,4],
            6: [5,4], 7: [5,5], 8: [6,5], 9: [6,6]
        },

        // Mutation recipes from actual game source (getMuts function)
        // matureReq: true = both parents must be MATURE (neighsM check)
        //            false = parent can be any age (neighs check, e.g. brown mold)
        // Key: pursue these in order for optimal progression
        mutationPath: [
            // Phase 1: Basic seeds from wheat
            { parents: ["Baker's wheat", "Baker's wheat"], child: "Thumbcorn", chance: 0.05, matureReq: true },
            // Phase 2: Build the chain
            { parents: ["Baker's wheat", "Thumbcorn"], child: "Cronerice", chance: 0.01, matureReq: true },
            { parents: ["Cronerice", "Thumbcorn"], child: "Gildmillet", chance: 0.03, matureReq: true },
            { parents: ["Baker's wheat", "Gildmillet"], child: "Ordinary clover", chance: 0.03, matureReq: true },
            { parents: ["Ordinary clover", "Gildmillet"], child: "Shimmerlily", chance: 0.02, matureReq: true },
            // Phase 3: High value plants
            { parents: ["Baker's wheat", "Baker's wheat"], child: "Bakeberry", chance: 0.001, matureReq: true },
            { parents: ["Baker's wheat", "Brown mold"], child: "Chocoroot", chance: 0.10, matureReq: [true, false] }, // wheat=mature, mold=any age!
            { parents: ["Chocoroot", "White mildew"], child: "White chocoroot", chance: 0.10, matureReq: [true, false] }, // chocoroot=mature, mildew=any
            { parents: ["Shimmerlily", "White chocoroot"], child: "Whiskerbloom", chance: 0.01, matureReq: true },
            { parents: ["Shimmerlily", "Cronerice"], child: "Elderwort", chance: 0.01, matureReq: true },
            // Phase 4: Queenbeet line
            { parents: ["Bakeberry", "Chocoroot"], child: "Queenbeet", chance: 0.01, matureReq: true },
            { parents: ["Queenbeet", "Queenbeet"], child: "Duketater", chance: 0.001, matureReq: true },
        ],

        // Plants to harvest for permanent upgrades (name -> upgrade drop chance)
        upgradeDrops: {
            "Baker's wheat": { upgrade: "Wheat slims", chance: 0.001, effect: "+1% CPS" },
            "Bakeberry": { upgrade: "Bakeberry cookies", chance: 0.015, effect: "+2% CPS" },
            "Elderwort": { upgrade: "Elderwort biscuits", chance: 0.01, effect: "+2% CPS, +2% grandma CPS" },
            "Duketater": { upgrade: "Duketater cookies", chance: 0.005, effect: "+10% CPS" },
            "Green rot": { upgrade: "Green yeast digestives", chance: 0.005, effect: "+1% GC gains/freq/dur, +3% drops" },
            "Drowsyfern": { upgrade: "Fern tea", chance: 0.01, effect: "+3% offline CPS" },
            "Ichorpuff": { upgrade: "Ichor syrup", chance: 0.005, effect: "+7% offline CPS, lumps mature 7min sooner" },
        },

        // High-value plants to farm once unlocked
        farmingPriority: ["Bakeberry", "Queenbeet", "Duketater", "Baker's wheat"],
    },

    // ========================================================================
    // GRIMOIRE KNOWLEDGE
    // ========================================================================
    grimoire: {
        // Max magic formula: floor(4 + T^0.6 + 15*ln(1 + T + 10*(L-1)/15))
        // T = wizard tower count, L = wizard tower level
        maxMagic: function(towers, level) {
            return Math.floor(4 + Math.pow(towers, 0.6) + 15 * Math.log(1 + towers + 10 * Math.max(0, level - 1) / 15));
        },

        spells: {
            ftHoF: { name: "Force the Hand of Fate", costPct: 0.6, costBase: 10,
                     note: "Best during Frenzy. Summons GC (Click Frenzy, Building Special, Lucky, etc.)" },
            conjure: { name: "Conjure Baked Goods", costPct: 0.4, costBase: 2,
                       note: "Free ~30min CPS. Cast when idle (no buffs)." },
            stretch: { name: "Stretch Time", costPct: 0.2, costBase: 8,
                       note: "Extend active buffs by 10%. Good during combos." },
            edifice: { name: "Spontaneous Edifice", costPct: 0.75, costBase: 20,
                       note: "Free building. Expensive magic cost." },
            haggler: { name: "Haggler's Charm", costPct: 0.1, costBase: 10,
                       note: "Upgrades 2% cheaper for 1 min." },
            pixies: { name: "Summon Crafty Pixies", costPct: 0.2, costBase: 10,
                      note: "Buildings 2% cheaper for 1 min." },
            gambler: { name: "Gambler's Fever Dream", costPct: 0.05, costBase: 3,
                       note: "Random spell at half cost, double backfire. Risky." },
            resurrect: { name: "Resurrect Abomination", costPct: 0.1, costBase: 20,
                         note: "Summon wrinkler." },
            diminish: { name: "Diminish Ineptitude", costPct: 0.2, costBase: 5,
                        note: "10x less backfire for 5 min." },
        },
    },

    // ========================================================================
    // SUGAR LUMP PRIORITIES
    // ========================================================================
    sugarLumps: {
        reserve: 100, // Keep 100 for Sugar Baking (+1% CPS per lump up to 100)

        // Minigame unlock: building ID -> { minigame name, why it matters }
        minigameUnlocks: {
            2: { name: "Garden", game: "Farm", why: "Unlock seed mutations, permanent upgrade drops, sugar lump farming via Juicy Queenbeet" },
            5: { name: "Stock Market", game: "Bank", why: "Unlock stock trading with hidden mode data for profit" },
            6: { name: "Pantheon", game: "Temple", why: "Unlock spirit slots for Mokalsium (+10% milk) and Godzamok (combo boost)" },
            7: { name: "Grimoire", game: "Wizard Tower", why: "Unlock Force the Hand of Fate for golden cookie combos" },
        },

        // Level-up benefits per building
        levelBenefits: {
            2: function(currentLevel) { // Farm
                var sizes = {1:[2,2],2:[3,2],3:[3,3],4:[4,3],5:[4,4],6:[5,4],7:[5,5],8:[6,5],9:[6,6]};
                var cur = sizes[currentLevel] || [6,6];
                var next = sizes[currentLevel+1] || [6,6];
                var plotsNow = cur[0]*cur[1], plotsNext = next[0]*next[1];
                return "Garden " + plotsNow + " -> " + plotsNext + " plots (+" + (plotsNext-plotsNow) + ")";
            },
            7: function(currentLevel) { // Wizard Tower
                var towers = Game.ObjectsById[7] ? Game.ObjectsById[7].amount : 0;
                var magNow = Math.floor(4 + Math.pow(towers,0.6) + 15*Math.log(1+towers+10*Math.max(0,currentLevel-1)/15));
                var magNext = Math.floor(4 + Math.pow(towers,0.6) + 15*Math.log(1+towers+10*Math.max(0,currentLevel)/15));
                return "Max magic " + magNow + " -> " + magNext + " (+" + (magNext-magNow) + ")";
            },
            5: function(currentLevel) { // Bank
                var capNow = 100 + 3*Math.max(0, currentLevel-1);
                var capNext = 100 + 3*Math.max(0, currentLevel);
                return "Market cap $" + capNow + " -> $" + capNext + ", resting values +1";
            },
            6: function(currentLevel) { // Temple
                return "Spirit slot power increased (Diamond/Ruby/Jade bonuses scale with level)";
            },
        },

        // Score a potential lump spend. Higher = spend first.
        scoreLevelUp: function(buildingId, currentLevel) {
            // Minigame unlock = top priority
            if (currentLevel === 0 && CookieCheater.KB.sugarLumps.minigameUnlocks[buildingId]) {
                return 1000;
            }
            // Farm plots are very valuable (more mutations, more farming)
            if (buildingId === 2 && currentLevel < 9) return 80 - currentLevel * 5;
            // Wizard Tower magic (diminishing returns)
            if (buildingId === 7 && currentLevel < 10) return 50 - currentLevel * 3;
            // Bank market cap (marginal)
            if (buildingId === 5 && currentLevel < 10) return 20 - currentLevel * 2;
            // Temple (marginal)
            if (buildingId === 6 && currentLevel < 10) return 15 - currentLevel * 2;
            // Any other building (synergy achievements only)
            return 5 - currentLevel;
        },
    },

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
