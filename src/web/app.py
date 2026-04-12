"""FastAPI application factory for the CookieCheater dashboard."""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from .routes import pages, api, ws
from .services.game_service import GameService


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start/stop the background game service."""
    service = app.state.game_service
    task = asyncio.create_task(service.start())
    yield
    service.stop()
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


def create_app(game_bridge, db_path="cheater.db", poll_interval=2):
    """Create the FastAPI app with all routes and services."""
    app = FastAPI(title="CookieCheater", lifespan=lifespan)

    # Setup services
    service = GameService(game_bridge, db_path, poll_interval)
    app.state.game_service = service
    app.state.game_bridge = game_bridge
    app.state.db_path = db_path

    # Static files and templates
    import os
    static_dir = os.path.join(os.path.dirname(__file__), "static")
    templates_dir = os.path.join(os.path.dirname(__file__), "templates")

    app.mount("/static", StaticFiles(directory=static_dir), name="static")
    app.state.templates = Jinja2Templates(directory=templates_dir)

    # Include routes
    app.include_router(pages.router)
    app.include_router(api.router, prefix="/api")
    app.include_router(ws.router)

    return app
