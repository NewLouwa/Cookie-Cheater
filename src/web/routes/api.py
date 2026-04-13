"""REST API routes for game state, config, and stats."""

from fastapi import APIRouter, Request
from ...utils.database import (
    get_recent_snapshots, get_recent_actions,
    get_market_price_history, get_market_trades, get_market_pnl_history,
    get_combo_history
)

router = APIRouter()


@router.get("/status")
async def get_status(request: Request):
    """Current game state from the bot."""
    service = request.app.state.game_service
    return service.latest_state or {"error": "No data yet"}


@router.get("/config")
async def get_config(request: Request):
    """Current bot configuration."""
    service = request.app.state.game_service
    return service.config.to_dict()


@router.post("/config")
async def update_config(request: Request):
    """Update bot configuration."""
    data = await request.json()
    service = request.app.state.game_service
    bridge = request.app.state.game_bridge

    for key, value in data.items():
        if hasattr(service.config, key):
            setattr(service.config, key, value)

    # Push config to the JS bot
    bridge.set_config(data)

    return service.config.to_dict()


@router.get("/history")
async def get_history(request: Request):
    """CPS and cookie history for charts."""
    db_path = request.app.state.db_path
    snapshots = get_recent_snapshots(db_path, limit=500)
    return snapshots


@router.get("/actions")
async def get_actions(request: Request):
    """Recent bot actions."""
    bridge = request.app.state.game_bridge
    try:
        actions = bridge.get_action_log(100)
        return actions or []
    except Exception:
        return []


@router.post("/save")
async def trigger_save(request: Request):
    """Manually save the game."""
    bridge = request.app.state.game_bridge
    filepath = bridge.save_to_file()
    return {"saved": filepath}


@router.post("/pre-ascension-spend")
async def pre_ascension_spend(request: Request):
    """Mega spend before ascending: sell market, pop wrinklers, buy all upgrades+buildings."""
    bridge = request.app.state.game_bridge
    result = bridge.connection.evaluate_js(
        "JSON.stringify(CookieCheater.modules.purchaser.preAscensionSpend())"
    )
    return {"status": "spent", "actions": result}


@router.post("/ascend")
async def trigger_ascend(request: Request):
    """Full ascension: mega spend then ascend."""
    bridge = request.app.state.game_bridge

    # Step 1: Pre-ascension mega spend
    bridge.connection.evaluate_js(
        "CookieCheater.modules.purchaser.preAscensionSpend()"
    )

    import time
    time.sleep(1)

    # Step 2: Ascend
    bridge.trigger_ascension()
    time.sleep(2)

    # Step 3: Buy heavenly upgrades in priority order
    from ...strategy.ascension import HEAVENLY_PRIORITY
    bought = []
    for name in HEAVENLY_PRIORITY:
        result = bridge.connection.evaluate_js(
            f'(function() {{'
            f'  var u = Game.Upgrades["{name}"];'
            f'  if (u && !u.bought && u.canBuy()) {{ u.buy(); return "bought"; }}'
            f'  return "skip";'
            f'}})()'
        )
        if result == "bought":
            bought.append(name)

    # Step 4: Reincarnate
    time.sleep(1)
    bridge.reincarnate()

    return {"status": "ascended", "heavenlyBought": bought}


@router.post("/bot/stop")
async def stop_bot(request: Request):
    """Stop the bot (set running=false, clear modules)."""
    bridge = request.app.state.game_bridge
    bridge.connection.evaluate_js("CookieCheater.running = false; 'stopped'")
    return {"status": "stopped"}


@router.post("/bot/start")
async def start_bot(request: Request):
    """Resume the bot."""
    bridge = request.app.state.game_bridge
    bridge.connection.evaluate_js("CookieCheater.running = true; 'started'")
    return {"status": "started"}


@router.post("/bot/reinject")
async def reinject_bot(request: Request):
    """Re-inject the bot (useful after page reload)."""
    from ...bot.assembler import assemble_bot
    bridge = request.app.state.game_bridge
    service = request.app.state.game_service
    # Kill old bot first
    bridge.connection.evaluate_js("""
        if (window.CookieCheater) {
            CookieCheater.running = false;
            CookieCheater.modules = {};
        }
        delete window.CookieCheater;
        'cleared'
    """)
    import time
    time.sleep(0.3)
    js_code = assemble_bot(service.config.to_dict())
    bridge.inject_bot(js_code)
    return {"status": "reinjected"}


@router.post("/lumps/approve")
async def approve_lump_spend(request: Request):
    """User approves a sugar lump spending option."""
    data = await request.json()
    choice = data.get("choice", 0)
    bridge = request.app.state.game_bridge
    result = bridge.connection.evaluate_js(
        f"CookieCheater.modules.sugarLumps.executeApproval({choice}) ? 'ok' : 'failed'"
    )
    return {"status": result}


@router.get("/market/history")
async def market_history(request: Request):
    """Get market price history from DB."""
    db_path = request.app.state.db_path
    good_id = request.query_params.get("good_id")
    limit = int(request.query_params.get("limit", 500))
    if good_id is not None:
        good_id = int(good_id)
    return get_market_price_history(db_path, good_id, limit)


@router.get("/market/trades")
async def market_trades(request: Request):
    """Get market trade history from DB."""
    db_path = request.app.state.db_path
    limit = int(request.query_params.get("limit", 100))
    return get_market_trades(db_path, limit)


@router.get("/market/pnl")
async def market_pnl(request: Request):
    """Get market P/L history from DB."""
    db_path = request.app.state.db_path
    limit = int(request.query_params.get("limit", 200))
    return get_market_pnl_history(db_path, limit)


@router.get("/combos")
async def combo_history(request: Request):
    """Get combo history from DB."""
    db_path = request.app.state.db_path
    limit = int(request.query_params.get("limit", 20))
    return get_combo_history(db_path, limit)


@router.post("/market/loan")
async def take_loan(request: Request):
    """User approves taking a loan."""
    data = await request.json()
    loan_id = data.get("id", 1)
    bridge = request.app.state.game_bridge
    result = bridge.connection.evaluate_js(
        f"""(function() {{
            var M = Game.ObjectsById[5].minigame;
            if (!M) return 'no market';
            try {{ M.takeLoan({loan_id}); return 'ok'; }}
            catch(e) {{ return e.message; }}
        }})()"""
    )
    return {"status": result}


@router.post("/lumps/skip")
async def skip_lump_proposal(request: Request):
    """User dismisses the current lump proposal."""
    bridge = request.app.state.game_bridge
    bridge.connection.evaluate_js("CookieCheater._lumpProposal = null; 'skipped'")
    return {"status": "skipped"}
