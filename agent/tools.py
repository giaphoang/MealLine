"""MealLine API client and the four allow-listed voice-agent tools.

The client intentionally has no generic URL method.  A tool can only reach one
of the four existing MealLine endpoints named in the project contract, and all
arguments are validated before an HTTP request is made.
"""

from __future__ import annotations

import asyncio
import json
import os
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class ToolValidationError(ValueError):
    """Raised before a malformed tool request can reach MealLine."""


class FeedAPIError(RuntimeError):
    """Raised when MealLine rejects or cannot serve an allow-listed request."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


JsonObject = dict[str, Any]


class FeedTransport(Protocol):
    async def request(
        self,
        method: str,
        url: str,
        headers: Mapping[str, str],
        body: bytes | None = None,
    ) -> tuple[int, JsonObject]:
        """Send one JSON request and return status plus decoded object."""


def _request_sync(
    method: str,
    url: str,
    headers: Mapping[str, str],
    body: bytes | None,
) -> tuple[int, JsonObject]:
    request = Request(url, data=body, headers=dict(headers), method=method)
    try:
        with urlopen(request, timeout=20) as response:  # noqa: S310 - URL is configured, paths are fixed.
            payload = response.read()
            status = int(response.status)
    except HTTPError as error:
        payload = error.read()
        status = int(error.code)
    except URLError as error:
        raise FeedAPIError(503, f"MealLine is unavailable: {error.reason}") from error
    except TimeoutError as error:
        raise FeedAPIError(504, "MealLine did not respond in time") from error
    try:
        decoded = json.loads(payload.decode("utf-8")) if payload else {}
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise FeedAPIError(status, "MealLine returned a non-JSON response") from error
    if not isinstance(decoded, dict):
        raise FeedAPIError(status, "MealLine returned an invalid JSON object")
    return status, decoded


class UrllibTransport:
    """Small dependency-free async transport for the four API calls."""

    async def request(
        self,
        method: str,
        url: str,
        headers: Mapping[str, str],
        body: bytes | None = None,
    ) -> tuple[int, JsonObject]:
        return await asyncio.to_thread(_request_sync, method, url, headers, body)


def _base_url() -> str:
    value = os.getenv("NOURISH_BASE_URL", "http://localhost:3003/feed/api").strip()
    if not value:
        raise ToolValidationError("NOURISH_BASE_URL must not be empty")
    return value.rstrip("/")


def _token() -> str:
    value = os.getenv("FEED_API_TOKEN", "").strip()
    if not value:
        raise ToolValidationError("FEED_API_TOKEN is required")
    return value


def _require_object(value: object, name: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping) or isinstance(value, list):
        raise ToolValidationError(f"{name} must be a JSON object")
    return value


def _positive_int(value: object, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ToolValidationError(f"{name} must be a positive integer")
    return value


def _text(value: object, name: str, minimum: int, maximum: int) -> str:
    if not isinstance(value, str):
        raise ToolValidationError(f"{name} must be text")
    value = value.strip()
    if not minimum <= len(value) <= maximum:
        raise ToolValidationError(f"{name} must be {minimum}-{maximum} characters")
    return value


REQUIRED_METADATA = (
    "source",
    "caseNumber",
    "language",
    "householdSize",
    "dietaryAvoid",
    "hasStove",
    "hasFridge",
    "addressRaw",
    "contactPreference",
    "staffRouting",
    "firstVisit",
)


def validate_generated_data(value: object) -> JsonObject:
    """Validate the persist-only body and its required intake metadata."""

    data = _require_object(value, "generatedData")
    metadata = _require_object(data.get("metadata"), "generatedData.metadata")
    missing = [key for key in REQUIRED_METADATA if key not in metadata]
    if missing:
        raise ToolValidationError("generatedData.metadata missing: " + ", ".join(missing))
    if metadata.get("source") != "pipecat_voice":
        raise ToolValidationError('generatedData.metadata.source must be "pipecat_voice"')
    _text(metadata.get("caseNumber"), "metadata.caseNumber", 1, 128)
    language = metadata.get("language")
    if language not in {"en", "vi", "es"}:
        raise ToolValidationError("metadata.language must be en, vi, or es")
    household = metadata.get("householdSize")
    if household is not None:
        _positive_int(household, "metadata.householdSize")
    avoids = metadata.get("dietaryAvoid")
    if not isinstance(avoids, list) or any(not isinstance(item, str) for item in avoids):
        raise ToolValidationError("metadata.dietaryAvoid must be a list of text values")
    for key in ("hasStove", "hasFridge", "firstVisit"):
        if not isinstance(metadata.get(key), bool):
            raise ToolValidationError(f"metadata.{key} must be boolean")
    for key in ("addressRaw", "contactPreference", "staffRouting"):
        if not isinstance(metadata.get(key), (str, type(None))):
            raise ToolValidationError(f"metadata.{key} must be text or null")
    items = data.get("items")
    if not isinstance(items, list) or len(items) > 20:
        raise ToolValidationError("generatedData.items must be a list of at most 20 items")
    for index, item in enumerate(items):
        current = _require_object(item, f"generatedData.items[{index}]")
        _positive_int(current.get("foodItemId"), f"generatedData.items[{index}].foodItemId")
        _text(current.get("name"), f"generatedData.items[{index}].name", 1, 200)
        quantity = current.get("quantity")
        if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity < 1:
            raise ToolValidationError(f"generatedData.items[{index}].quantity must be positive")
        _text(current.get("unit"), f"generatedData.items[{index}].unit", 1, 80)
        if "notes" in current and not isinstance(current.get("notes"), str):
            raise ToolValidationError(f"generatedData.items[{index}].notes must be text")
    # Round-trip JSON validation rejects sets, bytes, and other accidental
    # Python objects before they can reach Prisma's JSON column.
    try:
        normalized = json.loads(json.dumps(dict(data), ensure_ascii=False))
    except (TypeError, ValueError) as error:
        raise ToolValidationError("generatedData must contain JSON values only") from error
    if not isinstance(normalized, dict):  # defensive; dict(data) above guarantees this
        raise ToolValidationError("generatedData must be a JSON object")
    return normalized


@dataclass(slots=True)
class NourishClient:
    """Allow-listed HTTP client for an existing MealLine instance."""

    transport: FeedTransport | None = None
    base_url: str | None = None
    token: str | None = None

    def __post_init__(self) -> None:
        if self.transport is None:
            self.transport = UrllibTransport()
        if self.base_url is None:
            self.base_url = _base_url()
        self.base_url = self.base_url.rstrip("/")
        if self.token is None:
            self.token = _token()
        if not self.token:
            raise ToolValidationError("FEED_API_TOKEN is required")

    def _headers(self) -> dict[str, str]:
        # MealLine's existing JWT middleware reads auth_token from a cookie.  A
        # Bearer header is sent too for compatible FEED deployments, but no
        # password or new authentication route is introduced.
        assert self.token is not None
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.token}",
            "Cookie": f"auth_token={self.token}",
        }

    async def _call(self, method: str, path: str, body: JsonObject | None = None) -> JsonObject:
        assert self.transport is not None
        assert self.base_url is not None
        encoded = (
            json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            if body is not None
            else None
        )
        status, response = await self.transport.request(method, f"{self.base_url}{path}", self._headers(), encoded)
        if not 200 <= status < 300:
            error = response.get("error")
            message = error.get("message") if isinstance(error, Mapping) else None
            raise FeedAPIError(status, str(message or f"MealLine request failed ({status})"))
        return response

    async def inventory(self) -> JsonObject:
        return await self._call("GET", "/food-items")

    async def templates(self) -> JsonObject:
        return await self._call("GET", "/shopping-lists/templates")

    async def generate(self, payload: JsonObject) -> JsonObject:
        return await self._call("POST", "/shopping-lists/generate", payload)

    async def instance(self, instance_id: int) -> JsonObject:
        return await self._call("GET", f"/shopping-lists/instances/{instance_id}")


def validate_no_arguments(arguments: object | None) -> None:
    if arguments not in (None, {}):
        raise ToolValidationError("This tool does not accept arguments")


async def get_inventory(arguments: object | None = None, *, client: NourishClient | None = None) -> JsonObject:
    """GET the current MealLine inventory; this never writes data."""

    validate_no_arguments(arguments)
    return await (client or NourishClient()).inventory()


async def get_shopping_list_templates(
    arguments: object | None = None,
    *,
    client: NourishClient | None = None,
) -> JsonObject:
    """GET available shopping-list templates and their template IDs."""

    validate_no_arguments(arguments)
    return await (client or NourishClient()).templates()


async def create_shopping_list(arguments: object, *, client: NourishClient | None = None) -> JsonObject:
    """Persist one already-matched list with POST /shopping-lists/generate."""

    data = _require_object(arguments, "arguments")
    template_id = _positive_int(data.get("templateId"), "templateId")
    title = _text(data.get("title"), "title", 3, 100)
    generated_by = _text(data.get("generatedBy"), "generatedBy", 1, 200)
    generated_data = validate_generated_data(data.get("generatedData"))
    payload: JsonObject = {
        "templateId": template_id,
        "title": title,
        "generatedData": generated_data,
    }
    payload["generatedBy"] = generated_by
    return await (client or NourishClient()).generate(payload)


async def get_shopping_list_instance(arguments: object, *, client: NourishClient | None = None) -> JsonObject:
    """GET one persisted shopping-list instance by positive numeric ID."""

    data = _require_object(arguments, "arguments")
    instance_id = _positive_int(data.get("id"), "id")
    return await (client or NourishClient()).instance(instance_id)


TOOL_SCHEMAS: tuple[JsonObject, ...] = (
    {
        "type": "function",
        "function": {
            "name": "get_inventory",
            "description": "Read current MealLine food inventory. Never infer availability outside this result.",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_shopping_list_templates",
            "description": "Read MealLine shopping-list templates and select an existing templateId.",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_shopping_list",
            "description": "Persist a matched list after user read-back and explicit confirmation.",
            "parameters": {
                "type": "object",
                "additionalProperties": False,
                "required": ["templateId", "title", "generatedData", "generatedBy"],
                "properties": {
                    "templateId": {"type": "integer", "minimum": 1},
                    "title": {"type": "string", "minLength": 3, "maxLength": 100},
                    "generatedBy": {"type": "string", "minLength": 1, "maxLength": 200},
                    "generatedData": {
                        "type": "object",
                        "required": ["metadata", "items"],
                        "properties": {
                            "metadata": {"type": "object"},
                            "items": {"type": "array", "maxItems": 20},
                        },
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_shopping_list_instance",
            "description": "Read back a newly persisted MealLine shopping-list instance.",
            "parameters": {
                "type": "object",
                "additionalProperties": False,
                "required": ["id"],
                "properties": {"id": {"type": "integer", "minimum": 1}},
            },
        },
    },
)


async def call_tool(name: str, arguments: object, *, client: NourishClient | None = None) -> JsonObject:
    """Dispatch only one of the four declared tools."""

    handlers = {
        "get_inventory": get_inventory,
        "get_shopping_list_templates": get_shopping_list_templates,
        "create_shopping_list": create_shopping_list,
        "get_shopping_list_instance": get_shopping_list_instance,
    }
    handler = handlers.get(name)
    if handler is None:
        raise ToolValidationError(f"Unknown MealLine tool: {name}")
    return await handler(arguments, client=client)
