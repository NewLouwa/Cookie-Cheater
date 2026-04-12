"""Background service that polls game state and manages strategic decisions."""

import asyncio
import json
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, Set

from fastapi import WebSocket

from ...strategy.ascension import should_ascend
from ...strategy.config import BotConfig
from ...utils.database import setup_tables, save_snapshot


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

                    # Save snapshot every 30 seconds
                    now = time.time()
                    if now - self._last_snapshot_time >= 30:
                        save_snapshot(self.db_path, state)
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

    async def _check_strategy(self, state, loop):
        """Check high-level strategic decisions."""
        # Check ascension
        if self.config.auto_ascend:
            do_ascend, reason = should_ascend(state, self.config)
            if do_ascend:
                # Save before ascending
                await loop.run_in_executor(self._executor, self.bridge.save_to_file)
                await loop.run_in_executor(self._executor, self.bridge.trigger_ascension)
                # Wait for ascension screen
                await asyncio.sleep(2)
                # TODO: buy heavenly upgrades
                await loop.run_in_executor(self._executor, self.bridge.reincarnate)

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
