"""Per-call capabilities plus Twilio's signed WebSocket handshake."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import time
from urllib.parse import urlsplit, urlunsplit


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def verify_ticket(token: str, key: str) -> dict:
    if len(key) < 32 or len(token) > 1500 or not re.fullmatch(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", token):
        raise ValueError("invalid ticket")
    body, signature = token.split(".")
    expected = hmac.digest(key.encode(), body.encode(), "sha256")
    if not hmac.compare_digest(_decode(signature), expected):
        raise ValueError("invalid ticket")
    claims = json.loads(_decode(body))
    if not isinstance(claims, dict) or set(claims) != {"v", "sessionId", "callSid", "publicBaseUrl", "exp", "nonce"}:
        raise ValueError("invalid ticket")
    if claims["v"] != 1 or not isinstance(claims["exp"], int) or isinstance(claims["exp"], bool) or claims["exp"] <= time.time():
        raise ValueError("expired ticket")
    for field, pattern in (("sessionId", r"sess_[a-f0-9]{24}"), ("callSid", r"CA[a-fA-F0-9]{32}"), ("nonce", r"[a-f0-9]{24}")):
        if not isinstance(claims[field], str) or not re.fullmatch(pattern, claims[field]):
            raise ValueError("invalid ticket")
    url = urlsplit(claims["publicBaseUrl"])
    local = url.hostname in {"localhost", "127.0.0.1", "::1"}
    if not url.hostname or url.username or url.password or url.query or url.fragment or url.path not in {"", "/"} or not (
        url.scheme == "https" or (url.scheme == "http" and local)
    ):
        raise ValueError("invalid ticket")
    return claims


def valid_twilio_handshake(token: str, claims: dict, signature: str, auth_token: str) -> bool:
    if not signature or not auth_token:
        return False
    base = claims["publicBaseUrl"].rstrip("/")
    path = f"/api/voice/stream/{token}"
    url = urlsplit(base)
    # Twilio signs voice WSS handshakes without the port; its documentation
    # also calls out the trailing-slash variant. Every candidate still needs
    # the account's secret and the exact, signed call-ticket URL.
    host = url.hostname or ""
    if ":" in host:
        host = f"[{host}]"
    roots = {base, urlunsplit((url.scheme, host, "", "", "")),
             urlunsplit(("wss" if url.scheme == "https" else "ws", host, "", "", ""))}
    for root in roots:
        for suffix in ("", "/"):
            expected = base64.b64encode(hmac.digest(auth_token.encode(), (root + path + suffix).encode(), "sha1")).decode()
            if hmac.compare_digest(signature, expected):
                return True
    return False


def validate_start(start: dict, claims: dict, account_sid: str) -> str:
    wire = start.get("start", {})
    stream = wire.get("streamSid", "")
    media = wire.get("mediaFormat", {})
    if (start.get("event") != "start" or wire.get("callSid") != claims["callSid"]
            or wire.get("accountSid") != account_sid or not re.fullmatch(r"MZ[a-fA-F0-9]{32}", stream)
            or media != {"encoding": "audio/x-mulaw", "sampleRate": 8000, "channels": 1}):
        raise ValueError("stream does not match the authorized call")
    return stream
