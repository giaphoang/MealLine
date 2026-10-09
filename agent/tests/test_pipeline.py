from __future__ import annotations

from collections.abc import Mapping

import pytest

from agent.pipeline import CallSession
from agent.tools import NourishClient


class FakeTransport:
    def __init__(self, response: dict[str, object]) -> None:
        self.response = response

    async def request(
        self,
        _method: str,
        _url: str,
        _headers: Mapping[str, str],
        _body: bytes | None = None,
    ) -> tuple[int, dict[str, object]]:
        return 200, self.response


def intake_metadata() -> dict[str, object]:
    return {
        "source": "pipecat_voice",
        "caseNumber": "CASE-VOICE-1",
        "language": "vi",
        "householdSize": 5,
        "dietaryAvoid": ["peanut"],
        "hasStove": False,
        "hasFridge": True,
        "addressRaw": "123 Main",
        "contactPreference": "callback",
        "staffRouting": "standard",
        "firstVisit": True,
    }


@pytest.mark.asyncio
async def test_create_path_rebuilds_items_deterministically() -> None:
    inventory = {
        "foodItems": [
            {
                "id": 1,
                "name": "Peanut butter",
                "fulfilment": {"quantity": 20, "unit": "jar", "requiresStove": False, "requiresFridge": False},
                "statusFlags": {"isInStock": True},
                "dietaryFlags": {"vegan": True, "vegetarian": True, "glutenFree": True, "halal": True, "kosher": True},
            },
            {
                "id": 2,
                "name": "Canned beans",
                "fulfilment": {"quantity": 20, "unit": "can", "requiresStove": False, "requiresFridge": False},
                "statusFlags": {"isInStock": True},
                "dietaryFlags": {"vegan": True, "vegetarian": True, "glutenFree": True, "halal": True, "kosher": True},
            },
        ]
    }
    client = NourishClient(transport=FakeTransport(inventory), base_url="https://nourish.test/api", token="jwt")
    session = CallSession(client)
    generated = await session.deterministic_generated_data(
        {
            "metadata": intake_metadata(),
            # This is intentionally malicious model output. It must not survive.
            "items": [{"foodItemId": 1, "name": "Peanut butter", "quantity": 99, "unit": "jar"}],
        }
    )
    assert generated["metadata"] == intake_metadata()
    assert generated["items"] == [
        {
            "foodItemId": 2,
            "name": "Canned beans",
            "quantity": 3,
            "unit": "can",
            "notes": "Avoids: peanut",
        }
    ]
