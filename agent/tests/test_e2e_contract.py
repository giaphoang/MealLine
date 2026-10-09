from __future__ import annotations

import json
from collections.abc import Mapping

import pytest

from agent.pipeline import CallSession
from agent.tools import NourishClient, create_shopping_list, get_shopping_list_instance, get_shopping_list_templates


class FakeTransport:
    def __init__(self, responses: list[dict[str, object]]) -> None:
        self.responses = responses
        self.calls: list[tuple[str, str, bytes | None]] = []

    async def request(
        self,
        method: str,
        url: str,
        _headers: Mapping[str, str],
        body: bytes | None = None,
    ) -> tuple[int, dict[str, object]]:
        self.calls.append((method, url, body))
        response = self.responses.pop(0)
        return 200, response


def metadata() -> dict[str, object]:
    return {
        "source": "pipecat_voice",
        "caseNumber": "E2E-VI-5",
        "language": "vi",
        "householdSize": 5,
        "dietaryAvoid": ["peanut"],
        "hasStove": False,
        "hasFridge": True,
        "addressRaw": "123 Example",
        "contactPreference": "callback",
        "staffRouting": "standard",
        "firstVisit": True,
    }


@pytest.mark.asyncio
async def test_simulated_vi_intake_create_and_readback() -> None:
    inventory = {
        "foodItems": [
            {
                "id": 1,
                "name": "Peanut butter",
                "fulfilment": {"quantity": 10, "unit": "jar", "requiresStove": False, "requiresFridge": False},
                "statusFlags": {"isInStock": True},
                "dietaryFlags": {"vegan": True, "vegetarian": True, "glutenFree": True, "halal": True, "kosher": True},
            },
            {
                "id": 2,
                "name": "Frozen meals",
                "fulfilment": {"quantity": 10, "unit": "pack", "requiresStove": False, "requiresFridge": False},
                "statusFlags": {"isInStock": True},
                "dietaryFlags": {
                    "vegan": False,
                    "vegetarian": False,
                    "glutenFree": True,
                    "halal": True,
                    "kosher": True,
                },
            },
            {
                "id": 3,
                "name": "Canned beans",
                "fulfilment": {"quantity": 10, "unit": "can", "requiresStove": False, "requiresFridge": False},
                "statusFlags": {"isInStock": True},
                "dietaryFlags": {"vegan": True, "vegetarian": True, "glutenFree": True, "halal": True, "kosher": True},
            },
        ]
    }
    transport = FakeTransport(
        [inventory, {"templates": [{"id": 7}]}, {"instance": {"id": 42}}, {"instance": {"id": 42}}]
    )
    client = NourishClient(transport=transport, base_url="https://nourish.test/feed/api", token="jwt")
    session = CallSession(client)
    generated = await session.deterministic_generated_data({"metadata": metadata(), "items": []})
    templates = await get_shopping_list_templates({}, client=client)
    assert templates["templates"] == [{"id": 7}]
    created = await create_shopping_list(
        {"templateId": 7, "title": "Vietnamese intake", "generatedBy": "pipecat_voice", "generatedData": generated},
        client=client,
    )
    readback = await get_shopping_list_instance({"id": created["instance"]["id"]}, client=client)  # type: ignore[index]
    assert readback["instance"]["id"] == 42  # type: ignore[index]
    posted = json.loads(transport.calls[2][2] or "{}")
    items = posted["generatedData"]["items"]
    assert len(items) <= 20
    assert all("peanut" not in item["name"].lower() for item in items)
    assert all("frozen" not in item["name"].lower() and "uncooked" not in item["name"].lower() for item in items)
    assert posted["generatedData"]["metadata"] == metadata()
