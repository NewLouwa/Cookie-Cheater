"""Game constants and building data."""

BUILDINGS = [
    {"id": 0,  "name": "Cursor",              "base_price": 15,       "base_cps": 0.1},
    {"id": 1,  "name": "Grandma",             "base_price": 100,      "base_cps": 1},
    {"id": 2,  "name": "Farm",                "base_price": 1100,     "base_cps": 8},
    {"id": 3,  "name": "Mine",                "base_price": 12000,    "base_cps": 47},
    {"id": 4,  "name": "Factory",             "base_price": 130000,   "base_cps": 260},
    {"id": 5,  "name": "Bank",                "base_price": 1400000,  "base_cps": 1400},
    {"id": 6,  "name": "Temple",              "base_price": 20000000, "base_cps": 7800},
    {"id": 7,  "name": "Wizard Tower",        "base_price": 330000000, "base_cps": 44000},
    {"id": 8,  "name": "Shipment",            "base_price": 5100000000, "base_cps": 260000},
    {"id": 9,  "name": "Alchemy Lab",         "base_price": 75000000000, "base_cps": 1600000},
    {"id": 10, "name": "Portal",              "base_price": 1000000000000, "base_cps": 10000000},
    {"id": 11, "name": "Time Machine",        "base_price": 14000000000000, "base_cps": 65000000},
    {"id": 12, "name": "Antimatter Condenser","base_price": 170000000000000, "base_cps": 430000000},
    {"id": 13, "name": "Prism",               "base_price": 2100000000000000, "base_cps": 2900000000},
    {"id": 14, "name": "Chancemaker",         "base_price": 26000000000000000, "base_cps": 21000000000},
    {"id": 15, "name": "Fractal Engine",      "base_price": 310000000000000000, "base_cps": 150000000000},
    {"id": 16, "name": "Javascript Console",  "base_price": 71000000000000000000, "base_cps": 1100000000000},
    {"id": 17, "name": "Idleverse",           "base_price": 12000000000000000000000, "base_cps": 8300000000000},
    {"id": 18, "name": "Cortex Baker",        "base_price": 1900000000000000000000000, "base_cps": 64000000000000},
    {"id": 19, "name": "You",                 "base_price": 540000000000000000000000000, "base_cps": 510000000000000},
]

# Building count milestones that unlock tiered upgrades
BUILDING_MILESTONES = [1, 5, 25, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500]

# Market mode names
MARKET_MODES = {
    0: "Stable",
    1: "Slow Rise",
    2: "Slow Fall",
    3: "Fast Rise",
    4: "Fast Fall",
    5: "Chaotic",
}
