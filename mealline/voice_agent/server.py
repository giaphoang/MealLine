"""One Cloudflare origin for MealLine HTTP and authorized Pipecat streams."""
from __future__ import annotations

import argparse
import asyncio
import hmac
import os
import posixpath
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import unquote, urlsplit

import aiohttp
from dotenv import load_dotenv
from fastapi import FastAPI, Request, WebSocket
from fastapi.responses import JSONResponse, Response
from loguru import logger

from .extraction import Interpretation, interpret
from .security import valid_twilio_handshake, validate_start, verify_ticket

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / "voice_agent" / ".env", override=False)
load_dotenv(ROOT / ".env", override=False)


def mealline_url() -> str:
    base = os.getenv("MEALLINE_BASE_URL", "http://127.0.0.1:3000").rstrip("/")
    url = urlsplit(base)
    if url.scheme != "http" or url.hostname not in {"127.0.0.1", "localhost", "::1"} or url.username or url.password or url.query or url.fragment or url.path:
        raise ValueError("MealLine origin must be a local HTTP URL")
    return base


@asynccontextmanager
async def lifespan(app: FastAPI):
    mealline_url()
    async with aiohttp.ClientSession(auto_decompress=False, trust_env=False) as http:
        app.state.http = http
        app.state.active_calls = set()
        yield


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/agent/health")
async def health():
    ready = all(os.getenv(key) for key in ("OPENAI_API_KEY", "DEEPGRAM_API_KEY", "CARTESIA_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"))
    ready = ready and len(os.getenv("MEALLINE_AGENT_KEY", "")) >= 32
    return JSONResponse({"status": "ready" if ready else "configuration_required", "service": "mealline-pipecat",
                         "streamingLanguages": ["en", "es"], "vietnamese": "mealline-twiml-fallback"}, status_code=200 if ready else 503)


@app.post("/internal/interpret")
async def interpret_turn(request: Request):
    expected = "Bearer " + os.getenv("MEALLINE_AGENT_KEY", "")
    received = request.headers.get("authorization", "")
    if len(expected) < 39 or not hmac.compare_digest(received, expected):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    try:
        parsed = Interpretation.model_validate(await request.json())
    except Exception:
        return JSONResponse({"error": "invalid_input"}, status_code=400)
    try:
        return await interpret(parsed)
    except Exception:
        # MealLine's model wrapper provides deterministic fallback. Never
        # expose model errors, prompts, credentials or caller data to logs.
        return JSONResponse({"error": "model_unavailable"}, status_code=503)


@app.websocket("/api/voice/stream/{ticket}")
async def stream(websocket: WebSocket, ticket: str):
    call_id = None
    registered = False
    try:
        claims = verify_ticket(ticket, os.getenv("MEALLINE_AGENT_KEY", ""))
        if not valid_twilio_handshake(ticket, claims, websocket.headers.get("x-twilio-signature", ""), os.getenv("TWILIO_AUTH_TOKEN", "")):
            await websocket.close(code=1008)
            return
        call_id = claims["callSid"]
        calls = app.state.active_calls
        if call_id in calls or len(calls) >= 4:
            await websocket.close(code=1013)
            return
        calls.add(call_id)
        registered = True
        from .pipeline import MealLineClient, run_call
        http = app.state.http
        state = await MealLineClient(http, mealline_url(), ticket).request("GET", "/api/voice/agent/session")
        if state.get("status") != "active" or state.get("fallback"):
            await websocket.close(code=1008)
            return
        await websocket.accept()
        start = None
        for _ in range(3):
            message = await asyncio.wait_for(websocket.receive_json(), timeout=10)
            if message.get("event") == "start":
                start = message
                break
            if message.get("event") != "connected":
                raise ValueError("invalid stream start")
        if start is None:
            raise ValueError("missing stream start")
        stream_sid = validate_start(start, claims, os.getenv("TWILIO_ACCOUNT_SID", ""))
        await run_call(websocket, stream_sid, http, mealline_url(), ticket, state)
    except Exception:
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        if registered:
            app.state.active_calls.discard(call_id)


HOP = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"}


@app.api_route("/{path:path}", methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy(request: Request, path: str):
    # Never publish unauthenticated demo administration (transcripts, worker
    # dispatch, or migrations). Check decoded/normalized variants too, since
    # the upstream framework may decode a path again. Staff UI is unchanged.
    candidate = path
    for _ in range(5):
        normalized = posixpath.normpath("/" + candidate).lstrip("/").lower()
        if normalized in {"api/admin", "api/internal", "internal", "api/voice/stream"} or normalized.startswith(("api/admin/", "api/internal/", "internal/", "api/voice/stream/")):
            return JSONResponse({"error": "not_found"}, status_code=404)
        decoded = unquote(candidate)
        if decoded == candidate:
            break
        candidate = decoded
    body = await request.body()
    if len(body) > 8 * 1024 * 1024:
        return JSONResponse({"error": "request_too_large"}, status_code=413)
    headers = {key: value for key, value in request.headers.items() if key.lower() not in HOP}
    headers.setdefault("x-forwarded-host", request.headers.get("host", ""))
    headers.setdefault("x-forwarded-proto", request.url.scheme)
    target = mealline_url() + request.url.path + ("?" + request.url.query if request.url.query else "")
    try:
        async with app.state.http.request(request.method, target, data=body, headers=headers,
                                          allow_redirects=False, timeout=aiohttp.ClientTimeout(total=30)) as upstream:
            response = Response(await upstream.read(), status_code=upstream.status)
            response.raw_headers = [(key, value) for key, value in upstream.raw_headers if key.decode().lower() not in HOP]
            return response
    except (aiohttp.ClientError, asyncio.TimeoutError):
        return JSONResponse({"error": "mealline_unavailable"}, status_code=503)


def main():
    import uvicorn
    parser = argparse.ArgumentParser(description="MealLine Pipecat voice gateway")
    parser.add_argument("--port", type=int, default=7860)
    args = parser.parse_args()
    logger.remove()
    logger.add(sys.stderr, level="WARNING")
    # Call capabilities are URL path segments; do not put them in access logs.
    uvicorn.run(app, host="127.0.0.1", port=args.port, access_log=False, ws_max_size=65536)


if __name__ == "__main__":
    main()
