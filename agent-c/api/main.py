"""Compatibility entrypoint for Agent C.

Both commands are supported:

    uvicorn api.main:app --port 8003
    uvicorn api.server:app --port 8003
"""

from api.server import app
