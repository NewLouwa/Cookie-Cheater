"""WebSocket endpoint for live game state updates."""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    service = websocket.app.state.game_service
    await service.add_client(websocket)

    try:
        while True:
            # Keep connection alive, handle client messages
            data = await websocket.receive_text()
            # Could handle client commands here
    except WebSocketDisconnect:
        pass
    finally:
        service.remove_client(websocket)
