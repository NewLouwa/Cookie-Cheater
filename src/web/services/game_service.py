"""Background service that polls game state and manages strategic decisions."""

import asyncio
import json
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, Set

from fastapi import WebSocket

from ...strategy.ascension import should_ascend
from ...strategy.config import BotConfig
from ...utils.database import setup_tables, save_snapshot, save_market_prices, save_market_pnl, save_bot_actions, save_market_trade, save_combo


class GameService:
    """Polls the game via GameBridge and broadcasts state to WebSocket clients."""

    def __init__(self, game_bridge, db_path="cheater.db", poll_interval=2):
        self.bridge = game_bridge
        self.db_path = db_path
        self.poll_interval = poll_interval
        self.config = BotConfig()
        self.clients: Set[WebSocket] = set()
        self.latest_state: Optional[dict] = None
        self._running = False
        self._executor = ThreadPoolExecutor(max_workers=1)
        self._last_save_time = time.time()
        self._last_snapshot_time = 0
        self._last_action_count = 0  # Track action log position for trade extraction
        self._last_combo_count = 0   # Track combo log position

        setup_tables(db_path)

    async def start(self):
        """Main polling loop."""
        self._running = True
        loop = asyncio.get_event_loop()

        while self._running:
            try:
                # Fetch game state (blocking CDP call in thread pool)
                state = await loop.run_in_executor(
                    self._executor, self.bridge.get_status
                )

                if state:
                    self.latest_state = state

                    # Save snapshots every 30 seconds
                    now = time.time()
                    if now - self._last_snapshot_time >= 30:
                        save_snapshot(self.db_path, state)
                        # Save market prices to DB (deduped)
                        market = state.get("market")
                        if market and market.get("goods"):
                            save_market_prices(self.db_path, market)
                            # Save market P/L snapshot
                            if market.get("stats"):
                                save_market_pnl(self.db_path, market["stats"])
                        # Extract structured market trades from JS trade log
                        try:
                            trade_log = market.get("tradeLog") if market else None
                            if trade_log and len(trade_log) > self._last_action_count:
                                new_trades = trade_log[self._last_action_count:]
                                self._last_action_count = len(trade_log)
                                for t in new_trades:
                                    save_market_trade(self.db_path, t)
                        except Exception:
                            pass

                        # Extract combo history from pantheon module
                        try:
                            panth = state.get("pantheonInfo")
                            if panth and panth.get("comboLog"):
                                combo_log = panth["comboLog"]
                                if len(combo_log) > self._last_combo_count:
                                    new_combos = combo_log[self._last_combo_count:]
                                    self._last_combo_count = len(combo_log)
                                    for c in new_combos:
                                        if c.get("duration"):  # Only save completed combos
                                            save_combo(self.db_path, c)
                        except Exception:
                            pass

                        self._last_snapshot_time = now

                    # Check strategic decisions
                    await self._check_strategy(state, loop)

                    # Auto-save game periodically
                    save_interval = self.config.auto_save_interval_minutes * 60
                    if now - self._last_save_time >= save_interval:
                        await loop.run_in_executor(
                            self._executor, self.bridge.save_to_file
                        )
                        self._last_save_time = now

                    # Broadcast to WebSocket clients
                    await self.broadcast(state)

            except Exception as e:
                error_state = {"error": str(e)}
                await self.broadcast(error_state)

            await asyncio.sleep(self.poll_interval)

    def stop(self):
        self._running = False

    _ascending: False  # Prevent double-ascension

    async def _check_strategy(self, state, loop):
        """Check high-level strategic decisions."""
        if not self.config.auto_ascend or self._ascending:
            return

        do_ascend, reason = should_ascend(state, self.config)
        if not do_ascend:
            return

        self._ascending = True
        try:
            import logging
            logger = logging.getLogger(__name__)
            logger.info(f"AUTO-ASCENSION triggered: {reason}")

            # Step 1: Save game
            await loop.run_in_executor(self._executor, self.bridge.save_to_file)

            # Step 2: Pre-ascension mega spend
            await loop.run_in_executor(self._executor, lambda:
                self.bridge.connection.evaluate_js(
                    "CookieCheater.modules.purchaser.preAscensionSpend()"
                )
            )
            await asyncio.sleep(1)

            # Step 3: Ascend — trigger and handle confirmation popup
            await loop.run_in_executor(self._executor, lambda:
                self.bridge.connection.evaluate_js("""
                    Game.Ascend(1);
                    // Also click the confirmation if popup appears
                    setTimeout(function() {
                        var btn = document.querySelector('#promptOption0');
                        if (btn) btn.click();
                    }, 500);
                    'ascending'
                """)
            )

            # Wait for ascension screen to be visible
            for _ in range(15):
                in_ascend = await loop.run_in_executor(self._executor, lambda:
                    self.bridge.connection.evaluate_js(
                        "document.getElementById('game') && document.getElementById('game').className.indexOf('ascending') !== -1 ? 'yes' : 'no'"
                    )
                )
                if in_ascend == "yes":
                    break
                await asyncio.sleep(1)
            await asyncio.sleep(2)

            # Step 4: Buy all affordable heavenly upgrades (multiple passes)
            for pass_n in range(15):
                result = await loop.run_in_executor(self._executor, lambda:
                    self.bridge.connection.evaluate_js("""(function() {
                        var bought = [];
                        if (!Game.UpgradesByPool || !Game.UpgradesByPool.prestige) return JSON.stringify(bought);
                        var pool = Game.UpgradesByPool.prestige;
                        var buyable = pool.filter(function(u) { return !u.bought && u.canBuy() && u.basePrice <= Game.heavenlyChips; });
                        buyable.sort(function(a, b) { return a.basePrice - b.basePrice; });
                        for (var i = 0; i < buyable.length; i++) {
                            if (buyable[i].basePrice > Game.heavenlyChips) break;
                            Game.PurchaseHeavenlyUpgrade(buyable[i].id);
                            if (buyable[i].bought) bought.push(buyable[i].name);
                        }
                        return JSON.stringify(bought);
                    })()""")
                )
                if not result or result == "[]":
                    break
                await asyncio.sleep(0.5)

            # Step 5: Reincarnate — click button and handle confirmation
            await asyncio.sleep(1)
            await loop.run_in_executor(self._executor, lambda:
                self.bridge.connection.evaluate_js("""
                    Game.Reincarnate(1);
                    setTimeout(function() {
                        var btn = document.querySelector('#promptOption0');
                        if (btn) btn.click();
                    }, 500);
                    'reincarnating'
                """)
            )
            await asyncio.sleep(3)

            # Step 6: Wait for game ready
            for _ in range(20):
                ready = await loop.run_in_executor(self._executor, lambda:
                    self.bridge.connection.evaluate_js(
                        "typeof Game !== 'undefined' && Game.ready ? 'ready' : 'loading'"
                    )
                )
                if ready == "ready":
                    break
                await asyncio.sleep(1)

            # Step 7: Re-inject bot
            await loop.run_in_executor(self._executor, lambda:
                self.bridge.connection.evaluate_js("""
                    if (window.CookieCheater) { CookieCheater.running=false; CookieCheater.modules={}; }
                    delete window.CookieCheater; 'ok'
                """)
            )
            await asyncio.sleep(0.5)

            from ...bot.assembler import assemble_bot
            js_code = assemble_bot(self.config.to_dict())
            await loop.run_in_executor(self._executor, lambda:
                self.bridge.inject_bot(js_code)
            )

            logger.info("AUTO-ASCENSION complete — bot re-injected for new run")
            self._last_action_count = 0
            self._last_combo_count = 0

        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Auto-ascension failed: {e}")
        finally:
            self._ascending = False

    async def broadcast(self, data):
        """Send state to all connected WebSocket clients."""
        if not self.clients:
            return

        message = json.dumps(data) if isinstance(data, dict) else data
        dead = set()

        for ws in self.clients:
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)

        self.clients -= dead

    async def add_client(self, ws: WebSocket):
        self.clients.add(ws)
        if self.latest_state:
            await ws.send_text(json.dumps(self.latest_state))

    def remove_client(self, ws: WebSocket):
        self.clients.discard(ws)
