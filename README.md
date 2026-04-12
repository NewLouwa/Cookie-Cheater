# CookieCheater

A full-auto optimization bot for [Cookie Clicker](https://orteil.dashnet.org/cookieclicker/) (browser version). Starts from an empty bakery and plays optimally to endgame using hidden game data, wiki-accurate mechanics, and a real-time web dashboard.

## What it does

CookieCheater injects a 67KB JavaScript bot into Cookie Clicker's game loop (~30fps) via Chrome DevTools Protocol. It automates **everything**:

| Module | What it automates |
|--------|-------------------|
| **Clicker** | Auto-clicks the big cookie. Burst-clicks (15/frame) during Frenzy + Click Frenzy combos (x5439 multiplier) |
| **Purchaser** | Buys buildings & upgrades using payback period optimization. Lucky banking (keeps 6000x CPS reserve). Early-game bootstrap for empty bakeries |
| **Shimmer** | Pops golden cookies and reindeer within ~33ms of spawning |
| **Market** | **Cheats** - reads hidden mode/duration/delta data. Score-based trading, never sells at a loss, auto-hires brokers |
| **Wrinklers** | Lets all slots fill, pops in bulk for 1.1x return. Instant-pops shiny wrinklers (3.3x, 1/10000 chance) |
| **Grandmapocalypse** | Elder Pledge/Covenant management (configurable strategy) |
| **Dragon** | Trains Krumblor, sets Radiant Appetite (x2 CPS) + Breath of Milk auras |
| **Seasons** | Cycles Christmas/Halloween/Easter/Valentine to collect all seasonal upgrades |
| **Garden** | Plants Baker's Wheat/Bakeberry/Queenbeet, auto-harvests mature plants |
| **Pantheon** | Mokalsium/Jeremy/Muridal for passive. Auto-swaps Godzamok during combos + sells buildings for click boost |
| **Grimoire** | Casts Force the Hand of Fate at full mana, preferably during Frenzy for combo potential |
| **Sugar Lumps** | Auto-harvests ripe lumps. Spends on Wizard Tower > Farm > Bank > Temple |

## Architecture

```
Browser (Cookie Clicker)          Python (Orchestrator)
========================          ====================
                                  
  JS Bot Engine (30fps)  <--CDP-->  GameBridge
    12 modules                      Assembler (bundles JS)
    Game.registerHook               GameService (polls 2s)
                                    FastAPI Dashboard
                                    WebSocket broadcast
                                    SQLite snapshots
                                    Save management
                                    Ascension strategy
```

**JS tier** runs inside the game for instant reactions (golden cookies, combos).
**Python tier** handles browser lifecycle, dashboard, saves, and strategic decisions.

## Quick Start

```bash
# Clone
git clone https://github.com/NewLouwa/Cookie-Cheater.git
cd Cookie-Cheater

# Run (auto-installs deps, launches browser, injects bot, starts dashboard)
python run.py
```

That's it. The bot will:
1. Find or launch a Chromium browser with debug port 9222
2. Open Cookie Clicker at orteil.dashnet.org
3. Wait for the game to load
4. Inject the bot into the game
5. Start the web dashboard at **http://localhost:8080**

### Options

```bash
python run.py --web-port 9000    # Custom dashboard port
python run.py --port 9333        # Custom Chrome debug port
python run.py --no-launch        # Don't launch browser (connect to existing)
```

### Manual browser launch

If auto-launch doesn't work, start your browser manually:

```bash
# Chrome
chrome.exe --remote-debugging-port=9222 --remote-allow-origins=* https://orteil.dashnet.org/cookieclicker/

# Brave
brave.exe --remote-debugging-port=9222 --remote-allow-origins=* https://orteil.dashnet.org/cookieclicker/

# Edge
msedge.exe --remote-debugging-port=9222 --remote-allow-origins=* https://orteil.dashnet.org/cookieclicker/
```

Then: `python run.py --no-launch`

## Dashboard

The web dashboard shows real-time game state via WebSocket:

- **Top bar**: Cookies, CPS, Prestige, Lumps, Lucky Bank bar, Combo indicator
- **Bot activity**: Click count, golden cookies popped, buildings/upgrades bought
- **Active buffs**: Color-coded (CPS buffs = blue, Click buffs = yellow)
- **Buildings table**: All owned buildings with CPS and next price
- **Stock Market**: **Hidden data exposed** - mode, duration, delta, resting value, ratio
- **CPS chart**: Logarithmic CPS history over time
- **Action log**: Real-time feed of all bot decisions
- **Controls**: Start/Stop, Re-inject, Save, Ascend, per-module toggles

## Key Strategies

### Lucky Banking

The bot keeps `6000 * CPS` cookies in reserve at all times. This maximizes the Lucky golden cookie payout:

```
Lucky payout = min(900 * CPS, 15% of banked cookies)
To max: 15% * bank >= 900 * CPS  =>  bank >= 6000 * CPS
During Frenzy (x7): bank >= 42000 * CPS
```

### Combo Exploitation

When the bot detects overlapping buffs:
1. **Frenzy** (x7 CPS, 77s) triggers moderate clicking
2. **Click Frenzy** (x777 click, 13s) during Frenzy = **x5439** per click -> burst click
3. **Godzamok** auto-swaps into Diamond slot, sells 50 cheap buildings for +50% click power
4. Buildings are automatically rebuyed after the 10s buff expires

### Stock Market Cheating

The market module reads hidden game variables that normal players can't see:

| Hidden Data | What it reveals |
|-------------|----------------|
| `g.mode` | Current market mode (Stable/Slow Rise/Slow Fall/Fast Rise/Fast Fall/Chaotic) |
| `g.dur` | Ticks remaining in current mode (know exactly when trend reverses) |
| `g.d` | Price delta per tick (know if price is going up or down) |

The bot uses a **score-based system** (-60 to +60) combining price vs resting value, mode direction, mode duration, overhead, and position tracking. It **never sells at a loss** unless in deep Fast Fall with >15% drawdown.

### Ascension

- **First ascension**: at 365 prestige levels (unlocks key heavenly upgrades)
- **Subsequent**: when prestige would at least double
- Heavenly upgrade priority: Legacy > Heavenly Cookies > Dragon > Golden Cookie upgrades > Season Switcher > Permanent Upgrade Slots

## Project Structure

```
CookieCheater/
  run.py                    # Entry point
  run_web.py                # Browser launch + bot inject + dashboard
  requirements.txt          # Python deps
  src/
    browser/
      connection.py         # Chrome DevTools Protocol (CDP) wrapper
      launcher.py           # Cross-platform browser detection & launch
      game_bridge.py        # Game queries, JS injection, saves
    bot/
      engine.js             # Bot harness (CookieCheater namespace)
      assembler.py          # Bundles JS modules into single script
      modules/
        clicker.js          # Auto-click + combo burst
        purchaser.js        # Building/upgrade optimizer + Lucky banking
        shimmer.js          # Golden cookie popper
        market.js           # Stock market (hidden data cheat)
        wrinklers.js        # Wrinkler management
        grandmapocalypse.js # Elder Pledge/Covenant
        dragon.js           # Krumblor training + auras
        seasons.js          # Season cycling
        garden.js           # Garden automation
        pantheon.js         # Spirit management + Godzamok combos
        grimoire.js         # Force the Hand of Fate casting
        sugar_lumps.js      # Lump harvest + spending
    strategy/
      ascension.py          # When to ascend + heavenly upgrade order
      config.py             # All bot settings with defaults
    web/
      app.py                # FastAPI app
      routes/               # REST API + WebSocket + pages
      services/             # Background game polling
      static/               # CSS + JS
      templates/            # Dashboard HTML
    utils/
      database.py           # SQLite snapshots
      constants.py          # Building data, market modes
```

## Configuration

All settings are in `src/strategy/config.py`. Key options:

| Setting | Default | Description |
|---------|---------|-------------|
| `auto_click` | `True` | Enable auto-clicking |
| `clicks_per_frame` | `15` | Clicks per frame during combos |
| `click_only_during_buffs` | `False` | Only click during buff windows |
| `save_for_upgrades` | `True` | Wait for better upgrades before buying buildings |
| `auto_pop_golden` | `True` | Instantly pop golden cookies |
| `auto_ascend` | `False` | Auto-ascend (off by default, use dashboard button) |
| `first_ascension_target` | `365` | Prestige levels for first ascension |
| `grandmapocalypse_strategy` | `"pledge"` | `"pledge"` / `"covenant"` / `"full"` |
| `pop_wrinklers` | `True` | Auto-pop wrinklers when full |
| `auto_season_cycle` | `True` | Cycle seasons to collect all upgrades |
| `market_enabled` | `True` | Enable stock market trading |
| `auto_save_interval_minutes` | `5` | Auto-save game to disk |

Settings can be changed at runtime via the dashboard toggle switches or the `/api/config` endpoint.

## Requirements

- Python 3.8+
- Chromium-based browser (Chrome, Brave, Edge)
- Windows, Linux, or macOS

Dependencies (auto-installed on first run):
- `websocket-client` - CDP communication
- `requests` - Browser detection
- `fastapi` + `uvicorn` - Web dashboard
- `jinja2` - HTML templates
- `rich` - Terminal output
- `websockets` - WebSocket support

## License

GPLv3 - See [LICENSE](LICENSE)
