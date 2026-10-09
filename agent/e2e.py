"""Run the acceptance intake against a configured MealLine instance.

Usage::

    FEED_API_TOKEN=... python -m agent.e2e

The script uses no endpoint other than the four tools in ``tools.py``.  It is
safe to run repeatedly: every run creates one explicit shopping-list instance
because the MealLine endpoint is persist-only by contract.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).with_name(".env"), override=False)
except ImportError:  # pragma: no cover - dependency is declared in pyproject.toml
    pass

from .matcher import match_inventory
from .tools import (
    NourishClient,
    create_shopping_list,
    get_inventory,
    get_shopping_list_instance,
    get_shopping_list_templates,
)


async def run() -> int:
    client = NourishClient()
    inventory_response = await get_inventory({}, client=client)
    raw_items = inventory_response.get("foodItems")
    if not isinstance(raw_items, list):
        raise RuntimeError("MealLine inventory response did not contain foodItems")
    metadata = {
        "source": "pipecat_voice",
        "caseNumber": "SIMULATED-VI-5",
        "language": "vi",
        "householdSize": 5,
        "dietaryAvoid": ["peanut"],
        "hasStove": False,
        "hasFridge": True,
        "addressRaw": "123 Example Street",
        "contactPreference": "callback",
        "staffRouting": "standard",
        "firstVisit": True,
    }
    matched = match_inventory(
        [item for item in raw_items if isinstance(item, dict)],
        dietary_avoid=["peanut"],
        household_size=5,
        has_stove=False,
        has_fridge=True,
    )
    generated_data = {
        "metadata": metadata,
        "items": [
            {
                "foodItemId": item.id,
                "name": item.name,
                "quantity": min(item.quantity, 3),
                "unit": item.unit,
            }
            for item in matched
        ],
        "itemCount": len(matched),
    }
    templates_response = await get_shopping_list_templates({}, client=client)
    templates = templates_response.get("templates")
    if not isinstance(templates, list) or not templates or not isinstance(templates[0], dict):
        raise RuntimeError("MealLine returned no shopping-list templates")
    template_id = templates[0].get("id")
    if not isinstance(template_id, int):
        raise RuntimeError("MealLine returned an invalid template id")
    created = await create_shopping_list(
        {
            "templateId": template_id,
            "title": "Simulated Vietnamese household intake",
            "generatedBy": "pipecat_voice",
            "generatedData": generated_data,
        },
        client=client,
    )
    instance = created.get("instance")
    if not isinstance(instance, dict) or not isinstance(instance.get("id"), int):
        raise RuntimeError("MealLine create response did not contain an instance id")
    readback = await get_shopping_list_instance({"id": instance["id"]}, client=client)
    readback_instance = readback.get("instance")
    if not isinstance(readback_instance, dict):
        raise RuntimeError("MealLine read-back did not contain instance")
    persisted = readback_instance.get("generatedData")
    if not isinstance(persisted, dict):
        raise RuntimeError("MealLine read-back did not contain generatedData")
    persisted_items = persisted.get("items")
    if not isinstance(persisted_items, list) or len(persisted_items) > 20:
        raise RuntimeError("Read-back list exceeds the 20-item cap")
    names = [str(item.get("name", "")).lower() for item in persisted_items if isinstance(item, dict)]
    if any("peanut" in name for name in names):
        raise RuntimeError("Read-back list contains a peanut item")
    if any(any(word in name for word in ("frozen", "uncooked", "raw")) for name in names):
        raise RuntimeError("Read-back list contains a no-stove item")
    print(
        json.dumps(
            {
                "instanceId": instance["id"],
                "metadata": persisted.get("metadata"),
                "itemCount": len(persisted_items),
            }
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(run()))
    except Exception as error:
        print(f"e2e failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
