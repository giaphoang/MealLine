from __future__ import annotations

import json
from collections.abc import Mapping

import pytest

from agent.tools import (
    NourishClient,
    ToolValidationError,
    create_shopping_list,
    get_inventory,
    get_shopping_list_instance,
    get_shopping_list_templates,
)


class FakeTransport:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, Mapping[str, str], bytes | None]] = []
        self.responses: list[tuple[int, dict[str, object]]] = []

    async def request(
        self,
        method: str,
        url: str,
        headers: Mapping[str, str],
        body: bytes | None = None,
    ) -> tuple[int, dict[str, object]]:
        self.calls.append((method, url, headers, body))
        return self.responses.pop(0)


def valid_data() -> dict[str, object]:
    return {
        "metadata": {
            "source": "pipecat_voice",
            "caseNumber": "CASE-1",
            "language": "vi",
            "householdSize": 5,
            "dietaryAvoid": ["peanut"],
            "hasStove": False,
            "hasFridge": True,
            "addressRaw": "123 Main",
            "contactPreference": "callback",
            "staffRouting": "intake",
            "firstVisit": True,
        },
        "items": [{"foodItemId": 1, "name": "Beans", "quantity": 3, "unit": "can"}],
    }


@pytest.fixture
def client() -> tuple[NourishClient, FakeTransport]:
    transport = FakeTransport()
    return NourishClient(transport=transport, base_url="https://nourish.example/feed/api", token="jwt"), transport


async def test_inventory_contract(client: tuple[NourishClient, FakeTransport]) -> None:
    nourish, transport = client
    transport.responses.append((200, {"foodItems": []}))
    assert await get_inventory({}, client=nourish) == {"foodItems": []}
    method, url, headers, body = transport.calls[-1]
    assert (method, url) == ("GET", "https://nourish.example/feed/api/food-items")
    assert headers["Cookie"] == "auth_token=jwt"
    assert body is None


async def test_templates_and_readback_contract(client: tuple[NourishClient, FakeTransport]) -> None:
    nourish, transport = client
    transport.responses.extend([(200, {"templates": [{"id": 7}]}), (200, {"instance": {"id": 9}})])
    assert await get_shopping_list_templates({}, client=nourish) == {"templates": [{"id": 7}]}
    assert await get_shopping_list_instance({"id": 9}, client=nourish) == {"instance": {"id": 9}}
    assert transport.calls[1][1].endswith("/shopping-lists/instances/9")


async def test_create_contract_validates_and_posts_only_allowed_body(
    client: tuple[NourishClient, FakeTransport],
) -> None:
    nourish, transport = client
    transport.responses.append((201, {"instance": {"id": 11}}))
    result = await create_shopping_list(
        {
            "templateId": 7,
            "title": "Vietnamese household",
            "generatedBy": "pipecat_voice",
            "generatedData": valid_data(),
        },
        client=nourish,
    )
    assert result == {"instance": {"id": 11}}
    method, url, _headers, body = transport.calls[-1]
    assert method == "POST" and url.endswith("/shopping-lists/generate")
    assert body is not None
    posted = json.loads(body)
    assert posted["generatedData"]["metadata"]["source"] == "pipecat_voice"


@pytest.mark.parametrize(
    "arguments",
    [
        {"templateId": 0, "title": "bad", "generatedData": valid_data()},
        {"templateId": 1, "title": "bad", "generatedData": {"items": []}},
    ],
)
async def test_create_rejects_invalid_arguments_before_http(
    client: tuple[NourishClient, FakeTransport],
    arguments: object,
) -> None:
    nourish, transport = client
    with pytest.raises(ToolValidationError):
        await create_shopping_list(arguments, client=nourish)  # type: ignore[arg-type]
    assert transport.calls == []
