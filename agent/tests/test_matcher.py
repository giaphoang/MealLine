from __future__ import annotations

from agent.matcher import build_generated_data, match_inventory


def item(item_id: int, name: str, **kwargs: object) -> dict[str, object]:
    return {
        "id": item_id,
        "name": name,
        "fulfilment": {"quantity": 20, "unit": "can", "requiresStove": False, "requiresFridge": False},
        "statusFlags": {"isInStock": True},
        "dietaryFlags": {"vegan": True, "vegetarian": True, "glutenFree": True, "halal": True, "kosher": True},
        **kwargs,
    }


def metadata(**overrides: object) -> dict[str, object]:
    return {
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
        **overrides,
    }


def test_peanut_exclusion() -> None:
    result = match_inventory([item(1, "Peanuts"), item(2, "Canned beans")], dietary_avoid=["peanut"])
    assert [entry.name for entry in result] == ["Canned beans"]


def test_no_stove_excludes_frozen_and_uncooked() -> None:
    result = match_inventory(
        [
            item(1, "Frozen vegetables"),
            item(2, "Uncooked rice"),
            item(3, "Canned beans"),
            item(
                4,
                "Pasta",
                fulfilment={"quantity": 20, "unit": "box", "requiresStove": True, "requiresFridge": False},
            ),
        ],
        has_stove=False,
    )
    assert [entry.name for entry in result] == ["Canned beans"]


def test_household_scaling_is_ceil_half_and_never_zero() -> None:
    matched = match_inventory([item(1, "Beans")], household_size=5)
    generated = build_generated_data(matched, household_size=5, dietary_avoid=[], metadata=metadata(dietaryAvoid=[]))
    assert generated["items"] == [{"foodItemId": 1, "name": "Beans", "quantity": 3, "unit": "can"}]


def test_twenty_item_cap() -> None:
    result = match_inventory([item(index, f"Item {index}") for index in range(1, 30)])
    assert len(result) == 20
    assert result[-1].id == 20
