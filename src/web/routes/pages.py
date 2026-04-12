"""HTML page routes."""

from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/")
async def index(request: Request):
    templates = request.app.state.templates
    return templates.TemplateResponse("index.html", {"request": request})
